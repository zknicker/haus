import type { TaskActor } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    agentTaskFollowsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
    serverMembershipsTable,
    taskFollowsTable,
} from '../postgres/schema.ts';

type Writer = Pick<HausDatabase, 'execute' | 'insert' | 'select'>;

export async function followTask(
    tx: Writer,
    input: { actor: TaskActor; chatId: string; serverId: string }
): Promise<void> {
    if (input.actor.kind === 'agent') {
        await followTaskAsAgent(tx, { ...input, agentId: input.actor.agentId });
        return;
    }
    await setUserTaskFollow(tx, { ...input, followed: true, userId: input.actor.userId });
}

export async function setUserTaskFollow(
    tx: Pick<HausDatabase, 'insert'>,
    input: { chatId: string; followed: boolean; serverId: string; userId: string }
): Promise<void> {
    await tx
        .insert(taskFollowsTable)
        .values({
            followed: input.followed,
            serverId: input.serverId,
            taskChatId: input.chatId,
            taskChatKind: 'task',
            userId: input.userId,
        })
        .onConflictDoUpdate({
            set: { followed: input.followed, updatedAt: sql`now()` },
            target: [
                taskFollowsTable.serverId,
                taskFollowsTable.taskChatId,
                taskFollowsTable.userId,
            ],
        });
}

export async function isTaskFollowed(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string; userId: string }
): Promise<boolean> {
    const [row] = await db
        .select({ followed: taskFollowsTable.followed })
        .from(taskFollowsTable)
        .where(
            and(
                eq(taskFollowsTable.serverId, input.serverId),
                eq(taskFollowsTable.taskChatId, input.chatId),
                eq(taskFollowsTable.userId, input.userId)
            )
        )
        .limit(1);
    return row?.followed === true;
}

export async function seedTaskFollowers(
    tx: Writer,
    input: {
        assignee: TaskActor | null;
        chatId: string;
        filerUserId?: string;
        origin: { chatId: string; messageId: string } | null;
        projectId: string;
        serverId: string;
    }
): Promise<void> {
    const origin = input.origin
        ? await readOrigin(tx, { ...input.origin, serverId: input.serverId })
        : null;
    const scope = { chatId: input.chatId, serverId: input.serverId };
    const users = new Set([
        ...(origin?.authorUserId ? [origin.authorUserId] : []),
        ...(origin?.mentionedUserIds ?? []),
        ...(input.filerUserId ? [input.filerUserId] : []),
        ...(input.assignee?.kind === 'user' ? [input.assignee.userId] : []),
    ]);
    for (const userId of users) {
        const visible = await canSeeChannel(tx, {
            channelId: input.projectId,
            serverId: input.serverId,
            userId,
        });
        if (visible) {
            await setUserTaskFollow(tx, { ...scope, followed: true, userId });
        }
    }
    const originAgents =
        origin && input.origin
            ? mentionedAgentIds(
                  origin.content,
                  await readChannelAgents(tx, {
                      channelId: input.origin.chatId,
                      serverId: input.serverId,
                  })
              )
            : [];
    const agents = new Set([
        ...(origin?.authorAgentId ? [origin.authorAgentId] : []),
        ...originAgents,
        ...(input.assignee?.kind === 'agent' ? [input.assignee.agentId] : []),
    ]);
    for (const agentId of agents) {
        await followTaskAsAgent(tx, { ...scope, agentId });
    }
}

export async function followTaskMentions(
    tx: Writer,
    input: { chatId: string; mentionedUserIds: readonly string[]; serverId: string }
): Promise<void> {
    const [chat] = await tx
        .select({ parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat?.parentChatId) {
        return;
    }
    for (const userId of input.mentionedUserIds) {
        const visible = await canSeeChannel(tx, {
            channelId: chat.parentChatId,
            serverId: input.serverId,
            userId,
        });
        if (visible) {
            await setUserTaskFollow(tx, { ...input, followed: true, userId });
        }
    }
}

async function followTaskAsAgent(
    tx: Writer,
    input: { agentId: string; chatId: string; serverId: string }
): Promise<void> {
    await tx
        .insert(agentTaskFollowsTable)
        .values({
            agentId: input.agentId,
            followed: true,
            serverId: input.serverId,
            taskChatId: input.chatId,
            taskChatKind: 'task',
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            set: { followed: true, updatedAt: new Date() },
            target: [
                agentTaskFollowsTable.serverId,
                agentTaskFollowsTable.agentId,
                agentTaskFollowsTable.taskChatId,
            ],
        });
    await openAgentChatRead(tx, input);
}

async function readOrigin(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; messageId: string; serverId: string }
) {
    const [origin] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            content: chatMessagesTable.content,
            mentionedUserIds: chatMessagesTable.mentionedUserIds,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!origin) {
        throw new Error(`Origin Message ${input.messageId} disappeared mid-start.`);
    }
    return origin;
}

async function canSeeChannel(
    db: Pick<HausDatabase, 'select'>,
    input: { channelId: string; serverId: string; userId: string }
): Promise<boolean> {
    const [row] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatsTable.serverId),
                eq(serverMembershipsTable.userId, input.userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.channelId),
                visibleChats(input.userId)
            )
        )
        .limit(1);
    return row !== undefined;
}

async function readChannelAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { channelId: string; serverId: string }
) {
    return await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(channelAgentParticipantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, channelAgentParticipantsTable.serverId),
                eq(agentsTable.id, channelAgentParticipantsTable.agentId)
            )
        )
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, input.channelId),
                isNull(agentsTable.retiredAt)
            )
        );
}
