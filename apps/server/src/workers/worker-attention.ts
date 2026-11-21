import type { WorkerTurnStall } from '@haus/api';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { linkParentChatsTable } from './worker-visibility.ts';

/**
 * The opaque inbox key of one `worker_stall` item (specs/inbox.md "Worker items"). A stall
 * repeats on every observation, so its key names the turn, the stall, and its reminder window:
 * the same window collapses to one item, and the next window or a new stall opens a fresh one.
 */
export function stallDedupeKey(turnId: string, stall: WorkerTurnStall, window: number): string {
    return `worker-stall:${turnId}:${stall.since.getTime()}:${window}`;
}

/** A Chat that still exists and is not tombstoned, nor is its parent. */
export async function isLiveChat(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<boolean> {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .limit(1);
    return chat !== undefined;
}
