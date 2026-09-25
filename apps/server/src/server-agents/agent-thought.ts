import {
    type AgentThoughtEvent,
    type AgentThoughtFrame,
    agentThoughtFrameSchema,
    condenseThoughtLocally,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readActiveRunEngagements } from '../agent-delivery/chat-engagement.ts';
import { announceAgentThought } from '../agent-delivery/thought-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { ThoughtSummarizer } from './agent-thought-summarizer.ts';

/**
 * A run's reasoning frames closer together than this are ignored. The
 * Computer's four-second interval is the real limit; this only bounds
 * summarizer spend when a Computer misbehaves.
 */
export const thoughtReasoningSpacingMs = 3000;

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
    /** The phrase a frame announces, or null when nothing presentable remains. */
    phrase(frame: AgentThoughtFrame): Promise<string | null>;
}

export function createAgentThoughts(options: {
    now?: () => number;
    /** Null when the Server has no summarizer key; excerpts then use the heuristic. */
    summarizer: ThoughtSummarizer | null;
}): AgentThoughts {
    const now = options.now ?? Date.now;
    const lastReasoningAt = new Map<string, number>();
    // Entries outlive their window only until the next reasoning frame from any run.
    const spaced = (key: string) => {
        const at = now();
        for (const [entry, seenAt] of lastReasoningAt) {
            if (at - seenAt >= thoughtReasoningSpacingMs) {
                lastReasoningAt.delete(entry);
            }
        }
        if (lastReasoningAt.has(key)) {
            return false;
        }
        lastReasoningAt.set(key, at);
        return true;
    };
    const phrase = async (frame: AgentThoughtFrame) => {
        if (frame.kind === 'phrase') {
            return frame.text;
        }
        // The excerpt goes to the summarizer and nowhere else; it is dropped after this call.
        const summary = await options.summarizer?.summarize(frame.reasoning);
        return summary ?? condenseThoughtLocally(frame.reasoning);
    };

    return {
        async ingest(db, input, background) {
            const parsed = agentThoughtFrameSchema.safeParse(input.frame);
            if (!parsed.success) {
                return false;
            }
            const frame = parsed.data;
            if (frame.kind === 'reasoning' && !spaced(`${input.computerId}:${frame.runId}`)) {
                return true;
            }
            const events = await admitComputerAgentThought(db, { ...input, frame });
            if (events.length > 0) {
                void background.run('agent-thought.announce', async () => {
                    const text = await phrase(frame);
                    if (text) {
                        for (const event of events) {
                            announceAgentThought({ ...event, text });
                        }
                    }
                });
            }
            return true;
        },
        phrase,
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
