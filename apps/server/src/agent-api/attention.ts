import { and, eq } from 'drizzle-orm';
import { isHearer } from '../agent-delivery/hearing.ts';
import { deleteQueuedOrdinaryItems } from '../agent-delivery/store.ts';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTaskFollowsTable, chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { AgentTargetError, resolveAgentTarget } from './resolve-target.ts';

export async function unfollowAgentTask(db: HausDatabase, runner: ResolvedRunner, target: string) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const taskChatId = await resolveAgentTarget(tx, runner, target);
        const [task] = await tx
            .select({ projectId: chatsTable.parentChatId })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.id, taskChatId),
                    eq(chatsTable.kind, 'task')
                )
            )
            .limit(1);
        if (!task?.projectId) {
            throw new AgentTargetError('Unfollow requires a Task target.');
        }
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
        // A Project's hearers hear its Tasks whatever the follow says, so the queue stays.
        if (!(await isHearer(tx, runner, task.projectId))) {
            await deleteQueuedOrdinaryItems(tx, {
                agentId: runner.agentId,
                chatIds: [taskChatId],
                serverId: runner.serverId,
            });
        }
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
