import { taskCreatedTopic, taskUpdatedTopic } from '../realtime/topics.ts';

interface TaskEventSubject {
    boardId: string;
    id: string;
    serverId: string;
    version: number;
}

/** `task.created` for a Task about to commit. Ids and version only. */
export function prepareTaskCreatedEvent(task: TaskEventSubject) {
    return taskCreatedTopic.prepare(toEvent(task));
}

/** `task.updated` for an edit, move, assignment, or column restructure about to commit. */
export function prepareTaskUpdatedEvent(task: TaskEventSubject) {
    return taskUpdatedTopic.prepare(toEvent(task));
}

function toEvent(task: TaskEventSubject) {
    return {
        boardId: task.boardId,
        serverId: task.serverId,
        taskId: task.id,
        version: task.version,
    };
}
