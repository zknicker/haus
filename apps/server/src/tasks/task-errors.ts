/** No Task with that id or key exists on the Server. */
export class TaskNotFoundError extends Error {
    constructor(message = 'No task exists with that id on this Server.') {
        super(message);
        this.name = 'TaskNotFoundError';
    }
}

/** A stale `expectedVersion`: someone changed the Task first. */
export class TaskConflictError extends Error {
    constructor(current: number, expected: number) {
        super(`The task changed (version ${current}, expected ${expected}). Reload and retry.`);
        this.name = 'TaskConflictError';
    }
}

/**
 * A write the Task rules refuse: an assignee who is not an active member or
 * Agent, a column from another board, an archived board, an unknown label, or
 * a source message the actor cannot read.
 */
export class TaskInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TaskInvariantError';
    }
}

export function requireTaskVersion(current: number, expected: number): void {
    if (current !== expected) {
        throw new TaskConflictError(current, expected);
    }
}
