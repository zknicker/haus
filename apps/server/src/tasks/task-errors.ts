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

/** A key-ledger entry with that key already exists on the Server. */
export class TaskKeyConflictError extends Error {
    constructor(key: string) {
        super(`Another Task key on this Server is already ${key}.`);
        this.name = 'TaskKeyConflictError';
    }
}

/**
 * A write the Task rules refuse: an assignee who is not an active member or
 * Agent, an unknown label, an origin that is no Channel Message, or a change
 * to a chatless Task kept as history.
 */
export class TaskInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TaskInvariantError';
    }
}

/**
 * A Task named an origin Message in a DM. Tasks start from a Message in a
 * Channel; a DM request gets a reply carrying the Task chip (ADR 0053 decision 4).
 */
export class TaskOriginDmError extends Error {
    constructor() {
        super(
            'Tasks start from a Message in a Channel, never a DM. Post an origin Message in the Channel where the work belongs, mention whoever asked, start the Task from it, and reply in the DM with the Task.'
        );
        this.name = 'TaskOriginDmError';
    }
}

/**
 * A Task from before Tasks were places that 0125 left without a Chat is
 * read-only history: nothing changes its state, assignee, or fields.
 */
export function requireTaskPlace<Task extends { chatId: string | null }>(
    task: Task
): asserts task is Task & { chatId: string } {
    if (task.chatId === null) {
        throw new TaskInvariantError(
            'This Task is from before Tasks were places and is kept as read-only history.'
        );
    }
}

export function requireTaskVersion(current: number, expected: number): void {
    if (current !== expected) {
        throw new TaskConflictError(current, expected);
    }
}
