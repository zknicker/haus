import { and, eq, exists, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../postgres/schema.ts';
import { enqueueInboxItem, ensureDeliveryState, queuedFor } from './store.ts';

/**
 * The new Agent's one-time `#all` greeting (ADR 0028, amended 2026-11-03), as
 * Raft's `triggerNewAgentAllChannelGreeting`: creation queues one wake, and the
 * run that carries it tells the Agent to introduce itself. The row is bodiless
 * and noticeless, and it leads no lane of its own: a queued greeting rides the
 * next ordinary run whatever leads it, so the creator's @mention and the wake
 * become one first turn. Alone, it leads a run of its own. It is consumed only
 * by a run that showed it: no chatless run leads while it waits, and the
 * Computer shows it on every run that carries it, warm or cold.
 */
export const greetingInboxSource = 'greeting';

/** One per Agent: the inbox's dedupe uniqueness is the claim, so a replay queues nothing. */
export function greetingDedupeKey(agentId: string): string {
    return `greeting:${agentId}`;
}

/** Queues the greeting wake in `#all`, inside the creation transaction. */
export async function enqueueAgentGreeting(
    tx: HausDatabase,
    input: { agentId: string; allChannelId: string; serverId: string }
): Promise<void> {
    await ensureDeliveryState(tx, input);
    await enqueueInboxItem(tx, {
        agentId: input.agentId,
        chatId: input.allChannelId,
        content: 'Introduce yourself once in #all.',
        dedupeKey: greetingDedupeKey(input.agentId),
        serverId: input.serverId,
        source: greetingInboxSource,
    });
}

export function isGreetingRow(row: { source: string }): boolean {
    return row.source === greetingInboxSource;
}

/**
 * Retires a greeting the Agent already acted on. A Stop or reset requeues a
 * run's rows even after the run posted its introduction, a reconnect replays an
 * accepted run into its saved session, and the Computer shows the greeting on
 * any run that carries it; so a greeting whose Chat already has a message from
 * this Agent is spent, queued or attached, rather than shown again.
 */
export async function retireSpentGreeting(tx: HausDatabase, agentId: string): Promise<void> {
    await tx
        .update(agentInboxTable)
        .set({ seenAt: new Date(), state: 'seen' })
        .where(
            and(
                eq(agentInboxTable.agentId, agentId),
                eq(agentInboxTable.source, greetingInboxSource),
                ne(agentInboxTable.state, 'seen'),
                exists(
                    tx
                        .select({ id: chatMessagesTable.id })
                        .from(chatMessagesTable)
                        .where(
                            and(
                                eq(chatMessagesTable.serverId, agentInboxTable.serverId),
                                eq(chatMessagesTable.chatId, agentInboxTable.chatId),
                                eq(chatMessagesTable.authorAgentId, agentId)
                            )
                        )
                )
            )
        );
}

/**
 * Claims a queued greeting for the run being planned. Settlement consumes it
 * with the run's other rows; a run that fails without output, or a Stop,
 * requeues it.
 */
export async function attachQueuedGreeting(
    tx: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<boolean> {
    const attached = await tx
        .update(agentInboxTable)
        .set({ runId: input.runId, state: 'accepted' })
        .where(and(queuedFor(input.agentId), eq(agentInboxTable.source, greetingInboxSource)))
        .returning({ id: agentInboxTable.id });
    return attached.length > 0;
}
