import { isClosedTaskState } from '@haus/api';
import { resolveTaskTargetChat } from '../agent-api/resolve-task-target.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { readTask } from '../tasks/task-read.ts';
import { WorkerTaskClosedError, WorkerTaskRequiredError } from './errors.ts';

export async function requireOpenWorkerTask(
    db: Pick<HausDatabase, 'select'>,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskKey: string | undefined
) {
    if (!taskKey) {
        throw new WorkerTaskRequiredError();
    }
    const reached = await resolveTaskTargetChat(db, runner, taskKey);
    if (!reached) {
        throw new WorkerTaskRequiredError(
            `Task ${taskKey} does not exist or has no conversation yet. Start the Worker on a Task with a conversation.`
        );
    }
    const task = await readTask(db, runner.serverId, reached.taskId);
    if (isClosedTaskState(task.state)) {
        throw new WorkerTaskClosedError(task.key);
    }
    return { chatId: reached.chatId, key: task.key, projectId: task.projectId, taskId: task.id };
}
