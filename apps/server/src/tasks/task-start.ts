import type { Task, TaskActor } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor } from './task-actor.ts';
import {
    applyTaskAssignmentChange,
    type TaskAgentDelivery,
    type TaskWriteResult,
} from './task-assignment.ts';
import { TaskInvariantError, TaskOriginDmError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { assigneeColumns, requireTaskAssignee } from './task-fields.ts';
import { seedTaskFollowers } from './task-follows.ts';
import { allocateTaskNumber, resolveChannelTaskKeyId } from './task-key-ledger.ts';
import { readTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface StartTaskInput {
    assignee: TaskActor | null;
    description?: string;
    dueOn?: string;
    originChatId: string;
    originMessageId: string;
    priority?: Task['priority'];
    serverId: string;
    state: 'open' | 'todo';
    title: string;
}

export async function startTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: TaskAgentDelivery,
    input: StartTaskInput
): Promise<TaskWriteResult> {
    if (actor.kind !== 'agent') {
        throw new TaskInvariantError('Only Agents start Tasks. Ask an Agent to start one.');
    }
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        await requireOriginInChannel(tx, input);
        if (input.assignee) {
            await requireTaskAssignee(tx, input.serverId, input.assignee);
        }
        const keyId = await resolveChannelTaskKeyId(tx, {
            channelId: input.originChatId,
            serverId: input.serverId,
        });
        const number = await allocateTaskNumber(tx, { keyId, serverId: input.serverId });
        const chatId = createOpaqueId('cht');
        await tx.insert(chatsTable).values({
            anchorMessageId: input.originMessageId,
            id: chatId,
            kind: 'task',
            parentChatId: input.originChatId,
            parentChatKind: 'channel',
            serverId: input.serverId,
        });
        const taskId = createOpaqueId('tsk');
        await tx.insert(tasksTable).values({
            ...assigneeColumns(input.assignee),
            ...creatorColumns(actor),
            chatId,
            description: input.description ?? '',
            dueOn: input.dueOn ?? null,
            id: taskId,
            keyId,
            number,
            priority: input.priority ?? 'none',
            serverId: input.serverId,
            state: input.state,
            title: input.title,
        });
        await seedTaskFollowers(tx, {
            assignee: input.assignee,
            chatId,
            originChannelId: input.originChatId,
            originMessageId: input.originMessageId,
            serverId: input.serverId,
        });
        const task = await readTask(tx, input.serverId, taskId);
        return {
            assignmentChange: null,
            events: [prepareTaskCreatedEvent(task)],
            task,
            ...(await assignAgentOnStart(tx, agentDelivery, { actor, task, next: input.assignee })),
        };
    });
}

async function assignAgentOnStart(
    tx: Tx,
    agentDelivery: TaskAgentDelivery,
    change: { actor: TaskActor; next: TaskActor | null; task: TaskWriteResult['task'] }
): Promise<Pick<TaskWriteResult, 'wakes'>> {
    if (change.next?.kind !== 'agent') {
        return { wakes: [] };
    }
    const effects = await applyTaskAssignmentChange(tx, agentDelivery, {
        ...change,
        previous: null,
    });
    return { wakes: effects.wakes };
}

async function requireOriginInChannel(
    tx: Tx,
    input: { originChatId: string; originMessageId: string; serverId: string }
): Promise<void> {
    const [origin] = await tx
        .select({ kind: chatsTable.kind })
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.originChatId),
                eq(chatMessagesTable.id, input.originMessageId)
            )
        )
        .limit(1);
    if (!origin) {
        throw new TaskInvariantError('The origin Message is not in that Chat.');
    }
    if (origin.kind === 'dm') {
        throw new TaskOriginDmError();
    }
    if (origin.kind !== 'channel') {
        throw new TaskInvariantError(
            'Tasks start from a Message in a Channel, not one inside a Task.'
        );
    }
    await requireChatWritable(tx, { chatId: input.originChatId, serverId: input.serverId });
}
