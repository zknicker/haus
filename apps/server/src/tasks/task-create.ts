import type { TaskCreateInput } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor, type TaskActor } from './task-actor.ts';
import { TaskInvariantError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { seedTaskFollowers } from './task-follows.ts';
import { requireFilingProject } from './task-project.ts';
import { readTask } from './task-read.ts';
import { mintTaskShortId } from './task-short-id.ts';
import type { TaskWriteResult } from './task-write-result.ts';

export async function createTask(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskCreateInput
): Promise<TaskWriteResult> {
    if (actor.kind !== 'user') {
        throw new TaskInvariantError('People file Tasks; an Agent starts one from a Message.');
    }
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const project = await requireFilingProject(tx, input);
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
            projectId: project.projectId,
            serverId: input.serverId,
            shortId: await mintTaskShortId(tx, input.serverId),
            title: input.title,
        });
        await seedTaskFollowers(tx, {
            chatId,
            starter: actor,
            origin: null,
            projectId: project.projectId,
            serverId: input.serverId,
        });
        const task = await readTask(tx, input.serverId, taskId);
        return { events: [prepareTaskCreatedEvent(task)], task, wakes: [] };
    });
}
