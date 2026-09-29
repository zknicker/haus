import type { MessageTask, ServerDurableEvent } from '@haus/api';

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
    event: ServerDurableEvent | null;
    task: MessageTask;
}
