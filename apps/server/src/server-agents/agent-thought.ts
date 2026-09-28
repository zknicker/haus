import {
    type AgentThoughtEvent,
    type AgentThoughtFrame,
    agentThoughtFrameSchema,
    condenseThoughtLocally,
    thoughtRequestExcerpt,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import {
    readActiveRunEngagements,
    readActiveRunRequest,
} from '../agent-delivery/chat-engagement.ts';
import { announceAgentThought } from '../agent-delivery/thought-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { ThoughtSource, ThoughtSummarizer } from './agent-thought-summarizer.ts';
import { isHousekeepingThought } from './thought-housekeeping.ts';
import { createThoughtPreviousLines } from './thought-previous-lines.ts';

/**
 * A run's thought frames closer together than this are ignored once one of its
 * thoughts has been announced. Every frame, a title, excerpt, or action, is a paid
 * summarizer call; the Computer's four-second interval is the real limit, and
 * this only bounds spend when one misbehaves.
 */
export const thoughtSpacingMs = 3000;
/**
 * Until a run's first thought is announced, only frames closer than this are
 * ignored, so a skipped opening (claiming the task) never holds back the first
 * bubble that describes work.
 */
export const thoughtFirstSpacingMs = 1000;

interface ThoughtFrameInput {
    computerId: string;
    frame: unknown;
    serverId: string;
}

/** Computer thought frames (ADR 0036): admitted, phrased, announced, never stored. */
export interface AgentThoughts {
    /**
     * Handles a Computer frame when it is a thought; true once consumed,
     * admitted or not. Admission runs in the Computer's frame order; the
     * phrase and its announcement run as background work so a summary never
     * holds up the Computer's later frames.
     */
    ingest(
        db: HausDatabase,
        input: ThoughtFrameInput,
        background: Pick<ServerPostCommitWork, 'run'>
    ): Promise<boolean>;
    /**
     * The phrase a frame announces, or null when it is housekeeping or nothing
     * presentable remains. `request` is the scrubbed human message the run is
     * answering, context the summarizer may take nouns from; `previous` is the
     * run's last shown lines in the Chat, which the phrase should not restate.
     */
    phrase(frame: AgentThoughtFrame, context?: ThoughtContext): Promise<string | null>;
}

interface ThoughtContext {
    previous?: readonly string[];
    request?: string | null;
}

export function createAgentThoughts(options: {
    now?: () => number;
    /** Null when the Server has no summarizer key; frames then use the local fallback. */
    summarizer: ThoughtSummarizer | null;
}): AgentThoughts {
    const now = options.now ?? Date.now;
    const lastFrames = new Map<string, { announced: boolean; at: number }>();
    const previousLines = createThoughtPreviousLines(now);
    // Entries outlive their window only until the next reasoning frame from any run.
    const spaced = (key: string) => {
        const at = now();
        for (const [entry, last] of lastFrames) {
            if (at - last.at >= thoughtSpacingMs) {
                lastFrames.delete(entry);
            }
        }
        const last = lastFrames.get(key);
        if (last && (last.announced || at - last.at < thoughtFirstSpacingMs)) {
            return false;
        }
        lastFrames.set(key, { announced: false, at });
        return true;
    };
    const markAnnounced = (key: string) => {
        const last = lastFrames.get(key);
        if (last) {
            last.announced = true;
        }
    };
    const phrase = async (frame: AgentThoughtFrame, { previous, request }: ThoughtContext = {}) => {
        // The excerpt and request go to the summarizer and nowhere else; both are dropped after this call.
        const context = {
            ...(request ? { request } : {}),
            ...(previous && previous.length > 0 ? { previous } : {}),
        };
        const summary = await options.summarizer?.summarize(thoughtSource(frame, context));
        if (summary) {
            // SKIP is the model's judgment that this is housekeeping: no bubble.
            return summary.kind === 'phrase' ? summary.text : null;
        }
        if (frame.kind === 'action') {
            // A command line is not a phrase; without the summarizer an action shows nothing.
            return null;
        }
        const source = frame.kind === 'phrase' ? frame.text : frame.reasoning;
        if (isHousekeepingThought(source)) {
            return null;
        }
        return frame.kind === 'phrase' ? frame.text : condenseThoughtLocally(frame.reasoning);
    };

    return {
        async ingest(db, input, background) {
            const parsed = agentThoughtFrameSchema.safeParse(input.frame);
            if (!parsed.success) {
                return false;
            }
            const frame = parsed.data;
            const key = `${input.computerId}:${frame.runId}`;
            if (!spaced(key)) {
                return true;
            }
            const events = await admitComputerAgentThought(db, { ...input, frame });
            if (events.length > 0) {
                void background.run('agent-thought.announce', async () => {
                    const request = options.summarizer
                        ? await readRunRequest(db, input.serverId, frame)
                        : null;
                    // Usually one group: the run's Chats share their last lines unless one joined later.
                    const groups = groupByPrevious(events, (event) =>
                        previousLines.read({ ...event, computerId: input.computerId })
                    );
                    await Promise.all(
                        groups.map(async (group) => {
                            const text = await phrase(frame, { previous: group.previous, request });
                            if (!text) {
                                return;
                            }
                            markAnnounced(key);
                            for (const event of group.events) {
                                announceAgentThought({ ...event, text });
                                previousLines.remember(
                                    { ...event, computerId: input.computerId },
                                    text
                                );
                            }
                        })
                    );
                });
            }
            return true;
        },
        phrase,
    };
}

/** Engaged Chats grouped by the lines the run last showed there, so each group is phrased once. */
function groupByPrevious<Event>(
    events: readonly Event[],
    previousOf: (event: Event) => readonly string[]
): { events: Event[]; previous: readonly string[] }[] {
    const groups = new Map<string, { events: Event[]; previous: readonly string[] }>();
    for (const event of events) {
        const previous = previousOf(event);
        const key = JSON.stringify(previous);
        const group = groups.get(key) ?? { events: [], previous };
        group.events.push(event);
        groups.set(key, group);
    }
    return [...groups.values()];
}

function thoughtSource(
    frame: AgentThoughtFrame,
    context: { previous?: readonly string[]; request?: string }
): ThoughtSource {
    switch (frame.kind) {
        case 'action':
            return { action: frame.action, kind: 'action', ...context };
        case 'phrase':
            return { kind: 'title', title: frame.text, ...context };
        default:
            return { kind: 'reasoning', reasoning: frame.reasoning, ...context };
    }
}

/** The engaged human message, scrubbed and capped, that a run's thought is phrased against. */
async function readRunRequest(
    db: HausDatabase,
    serverId: string,
    frame: AgentThoughtFrame
): Promise<string | null> {
    const content = await readActiveRunRequest(db, {
        agentId: frame.agentId,
        runId: frame.runId,
        serverId,
    });
    return content ? thoughtRequestExcerpt(content) : null;
}

/** Where an admitted thought is announced: one event per engaged Chat, awaiting its phrase. */
export type AdmittedAgentThought = Omit<AgentThoughtEvent, 'text'>;

/**
 * Admits a Computer's thought for its Agent's active, accepted run — the same
 * identity checks as a Computer activity frame — and writes nothing. Returns
 * one event per Chat the run engages now, so only readers of those Chats hear
 * it; none when the Computer, Agent, or run does not match or nothing is engaged.
 */
export async function admitComputerAgentThought(
    db: HausDatabase,
    input: { computerId: string; frame: AgentThoughtFrame; serverId: string }
): Promise<AdmittedAgentThought[]> {
    const [row] = await db
        .select({
            acceptedAt: agentDeliveryTable.acceptedAt,
            activeRunComputerId: agentDeliveryTable.activeRunComputerId,
            activeRunId: agentDeliveryTable.activeRunId,
        })
        .from(agentsTable)
        .innerJoin(agentDeliveryTable, eq(agentDeliveryTable.agentId, agentsTable.id))
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.frame.agentId),
                eq(agentsTable.computerId, input.computerId)
            )
        )
        .limit(1);
    if (
        row?.activeRunComputerId !== input.computerId ||
        row.activeRunId !== input.frame.runId ||
        row.acceptedAt === null
    ) {
        return [];
    }
    const engagements = await readActiveRunEngagements(db, {
        agentId: input.frame.agentId,
        runId: input.frame.runId,
        serverId: input.serverId,
    });
    return engagements.map((engagement) => ({
        agentId: input.frame.agentId,
        at: input.frame.at,
        chatId: engagement.chatId,
        runId: input.frame.runId,
        serverId: input.serverId,
    }));
}
