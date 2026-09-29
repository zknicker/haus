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
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { ThoughtSource, ThoughtSummarizer } from './agent-thought-summarizer.ts';
import { phraseForChats } from './thought-announcement.ts';
import { createThoughtCadence, thoughtFindingRank } from './thought-cadence.ts';
import { isHousekeepingThought } from './thought-housekeeping.ts';
import { judgeThoughtLine, type PhrasedThought } from './thought-novelty.ts';
import { createThoughtPreviousLines } from './thought-previous-lines.ts';

interface ThoughtFrameInput {
    computerId: string;
    frame: unknown;
    serverId: string;
}

/** Computer thought frames (ADR 0036): admitted, phrased, announced, never stored. */
export interface AgentThoughts {
    /**
     * Handles a Computer frame when it is a thought; true once consumed,
     * admitted or not. Admission and the request's cadence run in the
     * Computer's frame order; the phrase and its announcement run as
     * background work so a summary never holds up the Computer's later frames.
     */
    ingest(
        db: HausDatabase,
        input: ThoughtFrameInput,
        background: Pick<ServerPostCommitWork, 'run'>
    ): Promise<boolean>;
    /**
     * The line a frame would announce and its workstream, or null when it is
     * housekeeping, nothing presentable remains, it repeats a shown line, or it
     * names the machinery. `request` is the scrubbed human message the run is
     * answering, context the summarizer may take nouns from; `requester` is its
     * author's display name, so a line restating their ask by name is dropped;
     * `previous` is the lines already shown for this request in the Chat. A
     * `still` line continues the shown work and reads "Still …".
     */
    phrase(frame: AgentThoughtFrame, context?: ThoughtContext): Promise<PhrasedThought | null>;
}

interface SummaryContext {
    previous?: readonly string[];
    request?: string;
    requester?: string;
}

interface ThoughtContext {
    previous?: readonly string[];
    request?: string | null;
    requester?: string | null;
}

export function createAgentThoughts(options: {
    now?: () => number;
    /** Runs `run` after `ms`; returns a cancel. Defaults to `setTimeout`. */
    schedule?: (run: () => void, ms: number) => () => void;
    /** Null when the Server has no summarizer key; frames then use the local fallback. */
    summarizer: ThoughtSummarizer | null;
}): AgentThoughts {
    const now = options.now ?? Date.now;
    const cadence = createThoughtCadence({ now, schedule: options.schedule });
    const previousLines = createThoughtPreviousLines(now);
    const phrase = async (
        frame: AgentThoughtFrame,
        { previous, request, requester }: ThoughtContext = {}
    ) => {
        // The excerpt and request go to the summarizer and nowhere else; both are dropped after this call.
        const context = {
            ...(request ? { request } : {}),
            ...(requester ? { requester } : {}),
            ...(previous && previous.length > 0 ? { previous } : {}),
        };
        const line = await phraseOnce(frame, context);
        // A reworded earlier line continues its work; a repeat or one about the machinery goes.
        return line
            ? judgeThoughtLine(line, {
                  finding: frame.kind === 'action' && Boolean(frame.result),
                  previous: previous ?? [],
                  request,
              })
            : null;
    };
    const phraseOnce = async (
        frame: AgentThoughtFrame,
        context: SummaryContext
    ): Promise<PhrasedThought | null> => {
        const summary = await options.summarizer?.summarize(thoughtSource(frame, context));
        if (summary) {
            // SKIP is the model's judgment that this is housekeeping: no bubble.
            return summary.kind === 'phrase'
                ? { stream: summary.stream, text: summary.text }
                : null;
        }
        if (frame.kind === 'action') {
            // A command line is not a phrase; without the summarizer an action shows nothing.
            return null;
        }
        const source = frame.kind === 'phrase' ? frame.text : frame.reasoning;
        if (isHousekeepingThought(source)) {
            return null;
        }
        const text =
            frame.kind === 'phrase'
                ? frame.text
                : condenseThoughtLocally(frame.reasoning, context.requester);
        return text ? { stream: 'new', text } : null;
    };

    return {
        async ingest(db, input, background) {
            const parsed = agentThoughtFrameSchema.safeParse(input.frame);
            if (!parsed.success) {
                return false;
            }
            const frame = parsed.data;
            const events = await admitComputerAgentThought(db, { ...input, frame });
            if (events.length === 0) {
                return true;
            }
            // The fallback needs the requester's name even without a summarizer.
            const { messageId, request, requester } = await readRunRequest(
                db,
                input.serverId,
                frame
            );
            // Paced per request: a message steered into a running turn starts its own cadence.
            const key = `${input.computerId}:${frame.runId}:${messageId ?? ''}`;
            cadence.offer(key, {
                phrase: () =>
                    phraseForChats({
                        events,
                        phrase: (previous) => phrase(frame, { previous, request, requester }),
                        previousLines,
                        scope: { computerId: input.computerId, requestId: messageId },
                    }),
                rank: frameRank(frame),
                run: (task) => void background.run('agent-thought.announce', task),
            });
            return true;
        },
        phrase,
    };
}

/** A finding outranks the model's own words, which outrank an inferred action. */
function frameRank(frame: AgentThoughtFrame): number {
    if (frame.kind !== 'action') {
        return 1;
    }
    return frame.result ? thoughtFindingRank : 0;
}

function thoughtSource(frame: AgentThoughtFrame, context: SummaryContext): ThoughtSource {
    switch (frame.kind) {
        case 'action':
            // The result excerpt rides this one call and is never stored or logged.
            return {
                action: frame.action,
                kind: 'action',
                ...(frame.result ? { result: frame.result } : {}),
                ...context,
            };
        case 'phrase':
            return { kind: 'title', title: frame.text, ...context };
        default:
            return { kind: 'reasoning', reasoning: frame.reasoning, ...context };
    }
}

/**
 * The engaged human message, scrubbed and capped, that a run's thought is
 * phrased against, and its author's display name.
 */
async function readRunRequest(
    db: HausDatabase,
    serverId: string,
    frame: AgentThoughtFrame
): Promise<{ messageId: string | null; request: string | null; requester: string | null }> {
    const row = await readActiveRunRequest(db, {
        agentId: frame.agentId,
        runId: frame.runId,
        serverId,
    });
    return {
        messageId: row?.id ?? null,
        request: row ? thoughtRequestExcerpt(row.content) : null,
        requester: row?.requester ?? null,
    };
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
