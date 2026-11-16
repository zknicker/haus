/** No board with that id (or key) exists on the Server. */
export class BoardNotFoundError extends Error {
    constructor() {
        super('No board exists with that id on this Server.');
        this.name = 'BoardNotFoundError';
    }
}

/** A stale `expectedVersion`, or a board key another board on the Server already uses. */
export class BoardConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BoardConflictError';
    }
}

/** A column list that breaks a board invariant (ADR 0051). */
export class BoardInvariantError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BoardInvariantError';
    }
}
