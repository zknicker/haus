import type { TaskActor } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor } from './task-actor.ts';
import { TaskInvariantError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { seedTaskFollowers } from './task-follows.ts';
import { resolveStartProject } from './task-project.ts';
import { readTask } from './task-read.ts';
import { mintTaskShortId } from './task-short-id.ts';
import type { TaskWriteResult } from './task-write-result.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface StartTaskInput {
    description?: string;
    originChatId: string;
    originMessageId: string;
    projectKey?: string;
    serverId: string;
    title: string;
}

export async function startTask(
    db: HausDatabase,
    actor: TaskActor,
    input: StartTaskInput
): Promise<TaskWriteResult> {
    if (actor.kind !== 'agent') {
        throw new TaskInvariantError('Only Agents start Tasks. Ask an Agent to start one.');
    }
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const origin = await requireOrigin(tx, input);
        const project = await resolveStartProject(tx, {
            agentId: actor.agentId,
            origin,
            ...(input.projectKey === undefined ? {} : { projectKey: input.projectKey }),
            serverId: input.serverId,
        });
        const chatId = createOpaqueId('cht');
        await tx.insert(chatsTable).values({
            id: chatId,
            kind: 'task',
            parentChatId: project.projectId,
            parentChatKind: 'channel',
            serverId: input.serverId,
        });
        const taskId = createOpaqueId('tsk');
        await tx.insert(tasksTable).values({
            ...creatorColumns(actor),
            chatId,
            description: input.description ?? '',
            id: taskId,
            originChatId: input.originChatId,
            originMessageId: input.originMessageId,
            projectId: project.projectId,
            serverId: input.serverId,
            shortId: await mintTaskShortId(tx, input.serverId),
            title: input.title,
        });
        await seedTaskFollowers(tx, {
            chatId,
            origin: { chatId: input.originChatId, messageId: input.originMessageId },
            projectId: project.projectId,
            serverId: input.serverId,
            starter: actor,
        });
        const task = await readTask(tx, input.serverId, taskId);
        return { events: [prepareTaskCreatedEvent(task)], task, wakes: [] };
    });
}

async function requireOrigin(
    tx: Tx,
    input: { originChatId: string; originMessageId: string; serverId: string }
) {
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
    if (origin.kind === 'task') {
        throw new TaskInvariantError(
            'Tasks start from a Message in a Channel or DM, not one inside a Task.'
        );
    }
    await requireChatWritable(tx, { chatId: input.originChatId, serverId: input.serverId });
    return { chatId: input.originChatId, kind: origin.kind };
}
