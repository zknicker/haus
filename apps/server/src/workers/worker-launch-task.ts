import type { HausDatabase } from '../postgres/connection.ts';
import { readTaskByRef } from '../tasks/task-list.ts';
import { WorkerTaskClosedError, WorkerTaskRequiredError } from './errors.ts';

export async function requireOpenWorkerTask(
    db: Pick<HausDatabase, 'select'>,
    runner: { serverId: string },
    taskRef: string | undefined
) {
    if (!taskRef) {
        throw new WorkerTaskRequiredError();
    }
    const task = await readTaskByRef(db, { ref: taskRef, serverId: runner.serverId });
    if (!task?.chatId) {
        throw new WorkerTaskRequiredError(
            `Task ${taskRef} does not exist or has no conversation yet. Start the Worker on a Task with a conversation.`
        );
    }
    if (task.archivedAt !== null) {
        throw new WorkerTaskClosedError(task.shortId);
    }
    return {
        chatId: task.chatId,
        projectId: task.projectId,
        shortId: task.shortId,
        taskId: task.id,
    };
}
