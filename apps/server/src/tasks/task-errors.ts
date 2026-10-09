import type { MessageTask } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';

export class TaskConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TaskConflictError';
    }
}

export class TaskNotFoundError extends Error {
    constructor() {
        super('No task exists in this Server with that message id.');
        this.name = 'TaskNotFoundError';
    }
}

export interface TaskMutationResult {
    event: PreparedRealtimeEvent | null;
    task: MessageTask;
}
