import { and, eq, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readBareReferenceTokens } from './bare-reference-tokens.ts';

/** One Message an Agent's `#channel:shortid` token can name. */
export interface MessageReferenceTarget {
    chatId: string;
    messageId: string;
}

/** The Channel messages an Agent's `#channel:shortid` tokens can name. */
export async function readReferencedMessages(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    content: string,
    channels: { id: string; name: string }[]
): Promise<MessageReferenceTarget[]> {
    const conditions = readBareReferenceTokens(content).flatMap((token) => {
        const shortId = token.messageShortId;
        if (!shortId) {
            return [];
        }
        return channels
            .filter((channel) => channel.name.toLocaleLowerCase('en-US') === token.key)
            .map((channel) =>
                and(
                    eq(chatMessagesTable.chatId, channel.id),
                    or(
                        eq(chatMessagesTable.id, shortId),
                        // Candidates only; `resolveMessageReference` applies the exact case rule.
                        sql`starts_with(lower(${chatMessagesTable.id}), ${`msg_${shortId}`.toLowerCase()})`
                    )
                )
            );
    });
    if (conditions.length === 0) {
        return [];
    }
    return await db
        .select({ chatId: chatMessagesTable.chatId, messageId: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.serverId, serverId), or(...conditions)));
}

/** The one Message in `chatId` that `reference` (a full or short id) names, or null. */
export function resolveMessageReference(
    messages: MessageReferenceTarget[],
    chatId: string,
    reference: string
) {
    const matches = new Set(
        messages
            .filter((message) => {
                if (message.chatId !== chatId) {
                    return false;
                }
                if (message.messageId === reference) {
                    return true;
                }
                if (!message.messageId.startsWith('msg_')) {
                    return false;
                }
                // Agents see `msg_` ids as their next eight characters (the CLI short id).
                // Opaque ids are case-sensitive base64url; only legacy hex ids fold case.
                const short = message.messageId.slice(4, 12);
                return (
                    short === reference ||
                    (/^msg_[a-fA-F0-9]{32}$/u.test(message.messageId) &&
                        short.toLowerCase() === reference.toLowerCase())
                );
            })
            .map((message) => message.messageId)
    );
    return matches.size === 1 ? [...matches][0] : null;
}
