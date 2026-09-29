import { and, eq, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, messageTasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { insertTaskEvent } from '../tasks/task-events.ts';
import {
    type TaskStatus,
    taskStatusChangeError,
    taskStatusColumns,
} from '../tasks/task-status-transitions.ts';
import { messageSelection } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { AgentTaskError } from './task-error.ts';
import { hasUnseenTaskThreadContext } from './task-freshness.ts';
import { findAgentTasks } from './task-lookup.ts';
import { taskRow } from './task-row.ts';

export async function unclaimAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const [task] = await findAgentTasks(db, runner, chatId, { numbers: [input.number] });
    return await mutateAgentTask(db, runner, task.messageId, task.version, 'unclaim');
}

export async function updateAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; status: TaskStatus; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const [task] = await findAgentTasks(db, runner, chatId, { numbers: [input.number] });
    return await mutateAgentTask(db, runner, task.messageId, task.version, 'update', input.status);
}

async function mutateAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageId: string,
    expectedVersion: number,
    action: 'unclaim' | 'update',
    status?: TaskStatus
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [current] = await tx
            .select()
            .from(messageTasksTable)
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId)
                )
            )
            .for('update');
        if (!current) {
            throw new AgentTaskError('That task no longer exists.');
        }
        await requireChatWritable(tx, {
            chatId: current.chatId,
            serverId: runner.serverId,
        });
        await requireMayMutate(tx, runner, current, expectedVersion, action, status);
        const [updated] = await tx
            .update(messageTasksTable)
            .set({
                ...(action === 'unclaim'
                    ? { assigneeAgentId: null, claimedAt: null }
                    : taskStatusColumns(current, status as TaskStatus)),
                updatedAt: sql`now()`,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId),
                    eq(messageTasksTable.version, expectedVersion)
                )
            )
            .returning({ version: messageTasksTable.version });
        if (!updated) {
            throw new AgentTaskError('That task changed; refresh it before updating.');
        }
        const event = await insertTaskEvent(tx, {
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: runner.serverId,
            type: 'task.updated',
        });
        const [next] = await tx
            .select()
            .from(messageTasksTable)
            .where(
                and(
                    eq(messageTasksTable.serverId, runner.serverId),
                    eq(messageTasksTable.messageId, messageId)
                )
            );
        const [message] = await tx
            .select(messageSelection)
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, runner.serverId),
                    eq(chatMessagesTable.id, messageId)
                )
            );
        return { event, task: await taskRow(tx, runner, message, next) };
    });
}

async function requireMayMutate(
    tx: HausDatabase,
    runner: ResolvedRunner,
    current: typeof messageTasksTable.$inferSelect,
    expectedVersion: number,
    action: 'unclaim' | 'update',
    status: TaskStatus | undefined
) {
    if (current.version !== expectedVersion) {
        throw new AgentTaskError('That task changed; refresh it before updating.');
    }
    if (action === 'unclaim') {
        if (current.assigneeAgentId !== runner.agentId) {
            throw new AgentTaskError('Only the current assignee may unclaim this task.');
        }
        if (current.status === 'done') {
            throw new AgentTaskError('Done tasks cannot be unclaimed.');
        }
        return;
    }
    if (await hasUnseenTaskThreadContext(tx, runner, current.messageId)) {
        throw new AgentTaskError(
            'New context exists in this task thread. Run haus message check before retrying.'
        );
    }
    // Status is member-level: any Agent that can write here may move it along
    // the transition table. Agents hold no Server role, so no force path.
    const refusal = taskStatusChangeError(current, status as TaskStatus, { force: false });
    if (refusal) {
        throw new AgentTaskError(refusal);
    }
}
