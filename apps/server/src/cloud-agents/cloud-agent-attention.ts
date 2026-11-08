import type { CloudAgentRunNotice, CloudAgentRunStall } from '@haus/api';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/**
 * The opaque inbox key of one notice: a settling Run gets exactly one, keyed by
 * its own id. A stall repeats on every retry tick, so its key names the stall
 * and its reminder window: the same window collapses to one notice, and the
 * next window opens a fresh one.
 */
export function noticeDedupeKey(
    runId: string,
    notice: CloudAgentRunNotice,
    stall: CloudAgentRunStall | null
): string {
    return notice.kind === 'stall' && stall
        ? `${runId}:stall:${stall.since.getTime()}:${notice.window}`
        : runId;
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
