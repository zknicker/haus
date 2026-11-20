import { and, eq } from 'drizzle-orm';
import { deleteQueuedOrdinaryItems } from '../agent-delivery/store.ts';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentChannelMutesTable, agentTaskFollowsTable, chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { AgentTargetError, resolveAgentTarget } from './resolve-target.ts';

export async function changeAgentChannelMute(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string,
    muted: boolean
) {
    const chatId = await resolveAgentTarget(db, runner, target);
    const [channel] = await db
        .select({ isAll: chatsTable.isAll, kind: chatsTable.kind, name: chatsTable.name })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, runner.serverId),
                eq(chatsTable.id, chatId),
                eq(chatsTable.kind, 'channel')
            )
        )
        .limit(1);
    if (!channel?.name) {
        throw new AgentTargetError('Channel mutes require a joined channel.');
    }
    if (muted && channel.isAll) {
        throw new AgentTargetError('Every Agent hears #all, the team room, so you cannot mute it.');
    }
    await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        if (muted) {
            await tx
                .insert(agentChannelMutesTable)
                .values({ agentId: runner.agentId, chatId, serverId: runner.serverId })
                .onConflictDoNothing();
            await deleteQueuedOrdinaryItems(tx, {
                agentId: runner.agentId,
                chatIds: [chatId],
                serverId: runner.serverId,
            });
        } else {
            await tx
                .delete(agentChannelMutesTable)
                .where(
                    and(
                        eq(agentChannelMutesTable.serverId, runner.serverId),
                        eq(agentChannelMutesTable.agentId, runner.agentId),
                        eq(agentChannelMutesTable.chatId, chatId)
                    )
                );
        }
    });
    return { muted, target: `#${channel.name}` };
}

export async function unfollowAgentTask(db: HausDatabase, runner: ResolvedRunner, target: string) {
    const taskChatId = await resolveAgentTarget(db, runner, target);
    const [task] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, runner.serverId),
                eq(chatsTable.id, taskChatId),
                eq(chatsTable.kind, 'task')
            )
        )
        .limit(1);
    if (!task) {
        throw new AgentTargetError('Unfollow requires a Task target.');
    }
    await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await tx
            .insert(agentTaskFollowsTable)
            .values({
                agentId: runner.agentId,
                followed: false,
                serverId: runner.serverId,
                taskChatId,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                set: { followed: false, updatedAt: new Date() },
                target: [
                    agentTaskFollowsTable.serverId,
                    agentTaskFollowsTable.agentId,
                    agentTaskFollowsTable.taskChatId,
                ],
            });
        await deleteQueuedOrdinaryItems(tx, {
            agentId: runner.agentId,
            chatIds: [taskChatId],
            serverId: runner.serverId,
        });
    });
    return { target, unfollowed: true };
}

/**
 * Follows a Task's Chat for an Agent. A new or restored follow starts the
 * Agent's read position there; an already-followed one keeps its unread.
 */
export async function followAgentTask(
    db: Pick<HausDatabase, 'execute' | 'insert' | 'select'>,
    input: { agentId: string; serverId: string; taskChatId: string }
) {
    const [previous] = await db
        .select({ followed: agentTaskFollowsTable.followed })
        .from(agentTaskFollowsTable)
        .where(
            and(
                eq(agentTaskFollowsTable.serverId, input.serverId),
                eq(agentTaskFollowsTable.agentId, input.agentId),
                eq(agentTaskFollowsTable.taskChatId, input.taskChatId)
            )
        )
        .limit(1);
    await db
        .insert(agentTaskFollowsTable)
        .values({ ...input, followed: true, updatedAt: new Date() })
        .onConflictDoUpdate({
            set: { followed: true, updatedAt: new Date() },
            target: [
                agentTaskFollowsTable.serverId,
                agentTaskFollowsTable.agentId,
                agentTaskFollowsTable.taskChatId,
            ],
        });
    if (previous?.followed !== true) {
        await openAgentChatRead(db, {
            agentId: input.agentId,
            chatId: input.taskChatId,
            serverId: input.serverId,
        });
    }
}
