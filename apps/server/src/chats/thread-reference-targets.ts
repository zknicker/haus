import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { readBareReferenceTokens } from './bare-reference-tokens.ts';

export interface ThreadReferenceTarget {
    anchorMessageId: string;
    parentChatId: string;
}

export async function readReferencedThreads(
    db: HausDatabase,
    serverId: string,
    content: string,
    channels: { id: string; name: string }[]
): Promise<ThreadReferenceTarget[]> {
    const names = new Set(
        readBareReferenceTokens(content)
            .filter((token) => token.threadAnchor)
            .map((token) => token.key)
    );
    const ids = channels
        .filter((channel) => names.has(channel.name.toLocaleLowerCase('en-US')))
        .map((channel) => channel.id);
    if (ids.length === 0) {
        return [];
    }
    const rows = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'thread'),
                inArray(chatsTable.parentChatId, ids),
                isNull(chatsTable.deletedAt)
            )
        );
    return rows.flatMap((row) =>
        row.anchorMessageId && row.parentChatId
            ? [{ anchorMessageId: row.anchorMessageId, parentChatId: row.parentChatId }]
            : []
    );
}

export function resolveThreadReference(
    threads: ThreadReferenceTarget[],
    parentChatId: string,
    reference: string
) {
    const matches = new Set(
        threads
            .filter((thread) => {
                if (thread.parentChatId !== parentChatId) {
                    return false;
                }
                const canonical = /^msg_([a-fA-F0-9]{32})$/u.exec(thread.anchorMessageId);
                return (
                    thread.anchorMessageId === reference ||
                    (canonical &&
                        canonical[1].slice(0, 8).toLowerCase() === reference.toLowerCase())
                );
            })
            .map((thread) => thread.anchorMessageId)
    );
    return matches.size === 1 ? [...matches][0] : null;
}
