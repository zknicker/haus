import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { visibleChats } from './chat-visibility.ts';

type ChatReader = Pick<HausDatabase, 'select'>;
const parentChatsTable = alias(chatsTable, 'parent_chat');

export class ChatNotFoundError extends Error {
    constructor() {
        super('No Chat exists in this Server with that id.');
        this.name = 'ChatNotFoundError';
    }
}

export class ChatAccessDeniedError extends Error {
    constructor() {
        super('You are not a participant in this Chat.');
        this.name = 'ChatAccessDeniedError';
    }
}

export class ChatArchivedError extends Error {
    constructor() {
        super('This channel is archived. Restore it before adding new work.');
        this.name = 'ChatArchivedError';
    }
}

export interface AccessibleChat {
    archivedAt: Date | null;
    captainAgentId: string | null;
    dmMemberOneStint: number | null;
    dmMemberOneUserId: string | null;
    dmMemberTwoStint: number | null;
    dmMemberTwoUserId: string | null;
    id: string;
    kind: 'captain' | 'channel' | 'dm' | 'task';
    lastMessageSequence: number;
    parentArchivedAt: Date | null;
    parentChatId: string | null;
    serverId: string;
}

export async function requireChatAccess(
    db: ChatReader,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
): Promise<AccessibleChat> {
    await requireServerMembership(db, member, input.serverId);

    if (!member) {
        throw new ChatAccessDeniedError();
    }

    const accessibleChat = await findChatAccess(db, member.id, input);

    if (accessibleChat) {
        return accessibleChat;
    }

    const [existingChat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);

    if (!existingChat) {
        throw new ChatNotFoundError();
    }

    throw new ChatAccessDeniedError();
}

export async function requireChatWriteAccess(
    db: ChatReader,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
): Promise<AccessibleChat> {
    const chat = await requireChatAccess(db, member, input);
    assertChatWritable(chat);
    return chat;
}

/** Agent routes authorize visibility separately, then share this lifecycle gate. */
export async function requireChatWritable(
    db: ChatReader,
    input: { chatId: string; serverId: string }
): Promise<void> {
    const [chat] = await db
        .select({
            archivedAt: chatsTable.archivedAt,
            id: chatsTable.id,
            parentArchivedAt: parentChatsTable.archivedAt,
            parentChatId: chatsTable.parentChatId,
            parentDeletedAt: parentChatsTable.deletedAt,
        })
        .from(chatsTable)
        .leftJoin(
            parentChatsTable,
            and(
                eq(parentChatsTable.serverId, chatsTable.serverId),
                eq(parentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    if (!chat) {
        throw new ChatNotFoundError();
    }
    if (chat.parentChatId && chat.parentDeletedAt) {
        throw new ChatNotFoundError();
    }
    assertChatWritable({ archivedAt: chat.archivedAt, parentArchivedAt: chat.parentArchivedAt });
}

export async function findChatAccess(
    db: ChatReader,
    userId: string,
    input: { chatId: string; serverId: string }
): Promise<AccessibleChat | null> {
    const [chat] = await db
        .select({
            archivedAt: chatsTable.archivedAt,
            captainAgentId: chatsTable.captainAgentId,
            dmMemberOneStint: chatsTable.dmMemberOneStint,
            dmMemberOneUserId: chatsTable.dmMemberOneUserId,
            dmMemberTwoStint: chatsTable.dmMemberTwoStint,
            dmMemberTwoUserId: chatsTable.dmMemberTwoUserId,
            id: chatsTable.id,
            kind: chatsTable.kind,
            lastMessageSequence: chatsTable.lastMessageSequence,
            parentChatId: chatsTable.parentChatId,
            parentArchivedAt: parentChatsTable.archivedAt,
            serverId: chatsTable.serverId,
        })
        .from(chatsTable)
        .leftJoin(
            parentChatsTable,
            and(
                eq(parentChatsTable.serverId, chatsTable.serverId),
                eq(parentChatsTable.id, chatsTable.parentChatId),
                isNull(parentChatsTable.deletedAt)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                visibleChats(userId)
            )
        )
        .limit(1);

    return chat
        ? {
              archivedAt: chat.archivedAt,
              captainAgentId: chat.captainAgentId,
              dmMemberOneStint: chat.dmMemberOneStint,
              dmMemberOneUserId: chat.dmMemberOneUserId,
              dmMemberTwoStint: chat.dmMemberTwoStint,
              dmMemberTwoUserId: chat.dmMemberTwoUserId,
              id: chat.id,
              kind: chat.kind,
              lastMessageSequence: chat.lastMessageSequence,
              parentChatId: chat.parentChatId,
              parentArchivedAt: chat.parentArchivedAt,
              serverId: chat.serverId,
          }
        : null;
}

function assertChatWritable(chat: { archivedAt: Date | null; parentArchivedAt: Date | null }) {
    if (chat.archivedAt || chat.parentArchivedAt) {
        throw new ChatArchivedError();
    }
}
