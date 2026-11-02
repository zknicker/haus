import { and, eq, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readBareReferenceTokens } from './bare-reference-tokens.ts';

export interface ThreadReferenceTarget {
    anchorMessageId: string;
    parentChatId: string;
}

/**
 * The Channel messages an Agent's `#channel:shortid` tokens can name. A thread
 * target is any message in the Channel, whether or not a Thread has started on
 * it yet, matching how the CLI sends to the same target.
 */
export async function readReferencedThreads(
    db: HausDatabase,
    serverId: string,
    content: string,
    channels: { id: string; name: string }[]
): Promise<ThreadReferenceTarget[]> {
    const conditions = readBareReferenceTokens(content).flatMap((token) => {
        const anchor = token.threadAnchor;
        if (!anchor) {
            return [];
        }
        return channels
            .filter((channel) => channel.name.toLocaleLowerCase('en-US') === token.key)
            .map((channel) =>
                and(
                    eq(chatMessagesTable.chatId, channel.id),
                    or(
                        eq(chatMessagesTable.id, anchor),
                        // Candidates only; `resolveThreadReference` applies the exact case rule.
                        sql`starts_with(lower(${chatMessagesTable.id}), ${`msg_${anchor}`.toLowerCase()})`
                    )
                )
            );
    });
    if (conditions.length === 0) {
        return [];
    }
    return await db
        .select({ anchorMessageId: chatMessagesTable.id, parentChatId: chatMessagesTable.chatId })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.serverId, serverId), or(...conditions)));
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
                if (thread.anchorMessageId === reference) {
                    return true;
                }
                if (!thread.anchorMessageId.startsWith('msg_')) {
                    return false;
                }
                // Agents see `msg_` ids as their next eight characters (the CLI short id).
                // Opaque ids are case-sensitive base64url; only legacy hex ids fold case.
                const short = thread.anchorMessageId.slice(4, 12);
                return (
                    short === reference ||
                    (/^msg_[a-fA-F0-9]{32}$/u.test(thread.anchorMessageId) &&
                        short.toLowerCase() === reference.toLowerCase())
                );
            })
            .map((thread) => thread.anchorMessageId)
    );
    return matches.size === 1 ? [...matches][0] : null;
}
