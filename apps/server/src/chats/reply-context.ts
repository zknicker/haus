import type { ChatMessageReply, ChatMessageReplyReference } from '@haus/api';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { escapeLike } from '../agent-api/resolve-target.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable } from '../postgres/schema/server-memberships.ts';
import { usersTable } from '../postgres/schema/users.ts';
import { agentsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { readStoredAuthorProfile } from './message-shape.ts';

const usersAlias = alias(usersTable, 'inline_reply_user');
const membershipsAlias = alias(serverMembershipsTable, 'inline_reply_membership');

const replyExcerptMaxLength = 280;

export class InvalidInlineReplyError extends Error {
    constructor(message = 'Inline replies require a parent Message in the same Channel or DM.') {
        super(message);
        this.name = 'InvalidInlineReplyError';
    }
}

export interface InlineReplyParent {
    parent: InlineReplyMessageRow;
    root: InlineReplyMessageRow;
}

interface InlineReplyMessageRow {
    authorAgentId: string | null;
    authorUserId: string | null;
    chatId: string;
    content: string;
    createdAt: Date;
    id: string;
    replyRootMessageId: string | null;
    replyToMessageId: string | null;
    sequence: number;
    serverId: string;
}

/** Resolve one full or short Message id as an inline parent in an exact Chat. */
export async function resolveInlineReplyParent(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; replyToMessageId: string; serverId: string }
): Promise<InlineReplyParent> {
    const [chat] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat || (chat.kind !== 'channel' && chat.kind !== 'dm')) {
        throw new InvalidInlineReplyError(
            'Inline replies are available only in Channels and DMs, not Threads.'
        );
    }

    const rows = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            chatId: chatMessagesTable.chatId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            sequence: chatMessagesTable.sequence,
            serverId: chatMessagesTable.serverId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                messageIdPredicate(input.replyToMessageId)
            )
        )
        .limit(2);
    if (rows.length === 0) {
        throw new InvalidInlineReplyError('That inline reply parent does not exist in this Chat.');
    }
    if (rows.length > 1) {
        throw new InvalidInlineReplyError('That inline reply parent id is ambiguous.');
    }
    const parent = rows[0];
    const rootMessageId = parent.replyRootMessageId ?? parent.id;
    const [root] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            chatId: chatMessagesTable.chatId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            sequence: chatMessagesTable.sequence,
            serverId: chatMessagesTable.serverId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, rootMessageId)
            )
        )
        .limit(1);
    if (!root) {
        throw new InvalidInlineReplyError('That inline reply root no longer exists.');
    }
    return { parent, root };
}

/**
 * Project ancestry for a set of stored Messages. The query is deliberately
 * one level deep: reply refs never contain another reply ref or a full body.
 */
export async function readInlineReplyContexts(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messages: Array<{
        id: string;
        replyRootMessageId: string | null;
        replyToMessageId: string | null;
    }>
): Promise<Map<string, ChatMessageReply>> {
    const replyMessages = messages.filter((message) => message.replyToMessageId !== null);
    if (replyMessages.length === 0) {
        return new Map();
    }
    const ids = [
        ...new Set(
            replyMessages.flatMap((message) => [
                message.replyToMessageId as string,
                message.replyRootMessageId ?? message.id,
            ])
        ),
    ];
    const rows = await readReplyReferenceRows(db, serverId, ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const contexts = new Map<string, ChatMessageReply>();
    for (const message of replyMessages) {
        const parent = byId.get(message.replyToMessageId as string);
        const root = byId.get(message.replyRootMessageId ?? message.id);
        if (!(parent && root)) {
            throw new InvalidInlineReplyError(`Message ${message.id} has missing reply ancestry.`);
        }
        contexts.set(message.id, {
            parent: toReplyReference(parent),
            parentMessageId: parent.id,
            root: toReplyReference(root),
            rootMessageId: root.id,
        });
    }
    return contexts;
}

export async function readInlineReplyContext(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    message: { id: string; replyRootMessageId: string | null; replyToMessageId: string | null }
) {
    return (await readInlineReplyContexts(db, serverId, [message])).get(message.id) ?? null;
}

async function readReplyReferenceRows(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    ids: string[]
) {
    const rows = await db
        .select({
            authorAgentAvatarId: agentsTable.avatarId,
            authorAgentDescription: agentsTable.description,
            authorAgentDisplayName: agentsTable.displayName,
            authorAgentId: agentsTable.id,
            authorAgentRetiredAt: agentsTable.retiredAt,
            authorUserAvatarId: usersAlias.avatarId,
            authorUserDescription: usersAlias.description,
            authorUserDisplayName: usersAlias.displayName,
            authorUserId: chatMessagesTable.authorUserId,
            authorUserRevokedAt: membershipsAlias.revokedAt,
            chatId: chatMessagesTable.chatId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(usersAlias, eq(usersAlias.id, chatMessagesTable.authorUserId))
        .leftJoin(
            membershipsAlias,
            and(
                eq(membershipsAlias.serverId, chatMessagesTable.serverId),
                eq(membershipsAlias.userId, chatMessagesTable.authorUserId)
            )
        )
        .where(and(eq(chatMessagesTable.serverId, serverId), inArray(chatMessagesTable.id, ids)));
    return rows;
}

function toReplyReference(
    row: Awaited<ReturnType<typeof readReplyReferenceRows>>[number]
): ChatMessageReplyReference {
    const author = row.authorAgentId
        ? {
              agentId: row.authorAgentId,
              kind: 'agent' as const,
              ...(readStoredAuthorProfile(row) ? { profile: readStoredAuthorProfile(row) } : {}),
          }
        : {
              kind: 'human' as const,
              ...(readStoredAuthorProfile(row) ? { profile: readStoredAuthorProfile(row) } : {}),
              userId: row.authorUserId as string,
          };
    return {
        author,
        content: boundReplyExcerpt(row.content),
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        sequence: row.sequence,
    };
}

function boundReplyExcerpt(content: string) {
    const characters = [...content];
    return characters.length <= replyExcerptMaxLength
        ? content
        : `${characters.slice(0, replyExcerptMaxLength - 1).join('')}…`;
}

export function messageIdPredicate(value: string) {
    return value.startsWith('msg_')
        ? eq(chatMessagesTable.id, value)
        : ilike(chatMessagesTable.id, `msg_${escapeLike(value)}%`);
}
