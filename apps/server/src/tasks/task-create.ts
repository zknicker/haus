import type { TaskCreateInput } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor, type TaskActor } from './task-actor.ts';
import { applyTaskAssignmentChange, type TaskAgentDelivery } from './task-assignment.ts';
import { TaskInvariantError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { assigneeColumns, requireTaskAssignee } from './task-fields.ts';
import { seedTaskFollowers } from './task-follows.ts';
import { allocateTaskNumber } from './task-key-ledger.ts';
import { requireFilingProject } from './task-project.ts';
import { readTask } from './task-read.ts';

export async function createTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: TaskAgentDelivery,
    input: TaskCreateInput
) {
    if (actor.kind !== 'user') {
        throw new TaskInvariantError('People file Tasks; an Agent starts one from a Message.');
    }
    const assignee = { agentId: input.assigneeAgentId, kind: 'agent' } as const;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const project = await requireFilingProject(tx, input);
        await requireTaskAssignee(tx, input.serverId, assignee);
        const number = await allocateTaskNumber(tx, {
            keyId: project.taskKeyId,
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
            ...assigneeColumns(assignee),
            ...creatorColumns(actor),
            chatId,
            description: input.description ?? '',
            id: taskId,
            keyId: project.taskKeyId,
            number,
            projectId: project.projectId,
            serverId: input.serverId,
            state: 'open',
            title: input.title,
        });
        await seedTaskFollowers(tx, {
            assignee,
            chatId,
            filerUserId: actor.userId,
            origin: null,
            projectId: project.projectId,
            serverId: input.serverId,
        });
        const task = await readTask(tx, input.serverId, taskId);
        const assignmentChange = { actor, next: assignee, previous: null, task };
        const effects = await applyTaskAssignmentChange(tx, agentDelivery, assignmentChange);
        return {
            assignmentChange,
            events: [prepareTaskCreatedEvent(task), ...effects.events],
            task,
            wakes: effects.wakes,
        };
    });
}
