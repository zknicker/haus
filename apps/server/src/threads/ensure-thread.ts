import { idSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentThreadFollowsTable,
    chatMessagesTable,
    chatsTable,
    threadFollowsTable,
} from '../postgres/schema.ts';
import { followMaterializedTaskThread } from '../tasks/task-thread-follows.ts';
import type { HausUser } from '../users/haus-user.ts';
import { threadChatIdForAnchor } from './thread-id.ts';

type ThreadWriter = Pick<HausDatabase, 'execute' | 'insert' | 'select'>;

export class InvalidThreadAnchorError extends Error {
    constructor() {
        super('The Thread anchor must be a message in its parent Chat.');
        this.name = 'InvalidThreadAnchorError';
    }
}

export class NestedThreadError extends Error {
    constructor() {
        super('Threads cannot contain child Threads.');
        this.name = 'NestedThreadError';
    }
}

export async function ensureThread(
    db: ThreadWriter,
    member: HausUser | null,
    input: { anchorMessageId: string; parentChatId: string; serverId: string }
) {
    await requireChatWriteAccess(db, member, {
        chatId: input.parentChatId,
        serverId: input.serverId,
    });
    const { created, ...thread } = await ensureThreadRecord(db, input);

    const [anchor] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.parentChatId),
                eq(chatMessagesTable.id, input.anchorMessageId)
            )
        )
        .limit(1);
    if (anchor?.authorUserId) {
        await db
            .insert(threadFollowsTable)
            .values({
                serverId: input.serverId,
                threadChatId: thread.id,
                userId: anchor.authorUserId,
            })
            .onConflictDoNothing();
    }
    // An Agent anchor author follows a Thread a human opens on its message (say,
    // to answer its @mention), so the first reply wakes it. Only at creation:
    // a later send into an existing Thread must not start waking the Agent.
    if (created && anchor?.authorAgentId) {
        await db
            .insert(agentThreadFollowsTable)
            .values({
                agentId: anchor.authorAgentId,
                followed: true,
                serverId: input.serverId,
                threadChatId: thread.id,
                updatedAt: new Date(),
            })
            .onConflictDoNothing();
        await openAgentChatRead(db, {
            agentId: anchor.authorAgentId,
            chatId: thread.id,
            serverId: input.serverId,
        });
    }
    return thread;
}

/** Creates the canonical thread row after the caller has proved parent authority. */
export async function ensureThreadRecord(
    db: ThreadWriter,
    input: { anchorMessageId: string; parentChatId: string; serverId: string }
) {
    const [parent] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.parentChatId)))
        .limit(1);
    if (!parent) {
        throw new InvalidThreadAnchorError();
    }
    if (parent.kind === 'thread') {
        throw new NestedThreadError();
    }

    const [anchor] = await db
        .select({
            id: chatMessagesTable.id,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.parentChatId),
                eq(chatMessagesTable.id, input.anchorMessageId)
            )
        )
        .limit(1);

    if (!anchor) {
        throw new InvalidThreadAnchorError();
    }

    const threadChatId = idSchema.parse(threadChatIdForAnchor(input.anchorMessageId));

    const [materialized] = await db
        .insert(chatsTable)
        .values({
            anchorMessageId: input.anchorMessageId,
            id: threadChatId,
            kind: 'thread',
            parentChatId: input.parentChatId,
            parentChatKind: parent.kind,
            serverId: input.serverId,
        })
        .onConflictDoNothing()
        .returning({ id: chatsTable.id });
    if (materialized) {
        await followMaterializedTaskThread(db, {
            anchorMessageId: input.anchorMessageId,
            serverId: input.serverId,
            threadChatId,
        });
    }

    const [thread] = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            id: chatsTable.id,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, threadChatId)))
        .limit(1);

    if (
        thread?.kind !== 'thread' ||
        thread.parentChatId !== input.parentChatId ||
        thread.anchorMessageId !== input.anchorMessageId
    ) {
        throw new InvalidThreadAnchorError();
    }

    return {
        created: materialized !== undefined,
        id: threadChatId,
        parentChatId: input.parentChatId,
    };
}
