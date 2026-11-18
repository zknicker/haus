import { taskCreatedTopic, taskUpdatedTopic } from '../realtime/topics.ts';

interface TaskEventSubject {
    chatId: string | null;
    id: string;
    serverId: string;
    version: number;
}

/** `task.created` for a Task about to commit. Ids and version only. */
export function prepareTaskCreatedEvent(task: TaskEventSubject) {
    return taskCreatedTopic.prepare(toEvent(task));
}

export function prepareTaskUpdatedEvent(task: TaskEventSubject) {
    return taskUpdatedTopic.prepare(toEvent(task));
}

function toEvent(task: TaskEventSubject) {
    return {
        chatId: task.chatId,
        serverId: task.serverId,
        taskId: task.id,
        version: task.version,
    };
}
