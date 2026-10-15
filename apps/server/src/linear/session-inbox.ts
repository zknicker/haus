import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { enqueueInboxItem, ensureDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';

/**
 * The two Linear session inbox sources (specs/linear-app.md#inbox-sources),
 * both concrete and bodiless: `linear_session` when a person caused the event,
 * `linear_session_automated` when the ledger ties it to a Haus write.
 */
export type LinearSessionInboxSource = 'linear_session' | 'linear_session_automated';
const linearSessionSources: LinearSessionInboxSource[] = [
    'linear_session',
    'linear_session_automated',
];

export function linearSessionDedupePrefix(sessionId: string): string {
    return `linear:${sessionId}:`;
}

/**
 * Enqueues one session event to its Agent in the anchor DM, inside the
 * caller's transaction. The dedupe key names the session and the Linear
 * delivery, so a replayed delivery never queues a second row.
 */
export async function enqueueLinearSessionItem(
    tx: HausDatabase,
    input: {
        agentId: string;
        automated: boolean;
        chatId: string;
        content: string;
        createdAt: Date;
        deliveryId: string;
        serverId: string;
        sessionId: string;
    }
): Promise<void> {
    await ensureDeliveryState(tx, { agentId: input.agentId, serverId: input.serverId });
    await enqueueInboxItem(tx, {
        agentId: input.agentId,
        chatId: input.chatId,
        content: input.content,
        createdAt: input.createdAt,
        dedupeKey: `${linearSessionDedupePrefix(input.sessionId)}${input.deliveryId}`,
        serverId: input.serverId,
        source: input.automated ? 'linear_session_automated' : 'linear_session',
    });
}

/**
 * Drops a session's queued rows no run has taken yet: all of them when the
 * session closes, or only one Agent's when the session is rerouted away.
 */
export async function retireLinearSessionItems(
    tx: HausDatabase,
    input: { agentId?: string; serverId: string; sessionIds: readonly string[] }
): Promise<void> {
    for (const sessionId of input.sessionIds) {
        await tx
            .delete(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.serverId, input.serverId),
                    input.agentId ? eq(agentInboxTable.agentId, input.agentId) : undefined,
                    eq(agentInboxTable.state, 'queued'),
                    isNull(agentInboxTable.runId),
                    inArray(agentInboxTable.source, linearSessionSources),
                    like(
                        agentInboxTable.dedupeKey,
                        `${linearSessionDedupePrefix(sessionId).replace(/[\\%_]/gu, '\\$&')}%`
                    )
                )
            );
    }
}
