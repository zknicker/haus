export class WorkerConflictError extends Error {
    constructor(message = 'That Worker nonce already belongs to a different Message.') {
        super(message);
        this.name = 'WorkerConflictError';
    }
}

export class WorkerNotLaunchedError extends Error {
    constructor() {
        super(
            'This Worker has no provider identity yet. Wait for its initial launch before sending a follow-up.'
        );
        this.name = 'WorkerNotLaunchedError';
    }
}

export class WorkerAgentNotFoundError extends Error {
    constructor() {
        super('The delegating Agent no longer exists.');
        this.name = 'WorkerAgentNotFoundError';
    }
}

export class WorkerNotFoundError extends Error {
    constructor() {
        super('That Worker does not exist.');
        this.name = 'WorkerNotFoundError';
    }
}

export class WorkerSettledError extends Error {
    constructor() {
        super('That Worker has already settled.');
        this.name = 'WorkerSettledError';
    }
}

export class WorkerCancelDeniedError extends Error {
    constructor() {
        super('Only the delegating Agent, an Owner, or an Admin may cancel Worker.');
        this.name = 'WorkerCancelDeniedError';
    }
}

/** The work outlives its removed Computer, but nothing can reach its provider now. */
export class WorkerComputerRemovedError extends Error {
    constructor() {
        super(
            'The Computer that launched this Worker was removed, so Haus can no longer reach it.'
        );
        this.name = 'WorkerComputerRemovedError';
    }
}

export class WorkerTaskRequiredError extends Error {
    constructor(
        message = 'A Worker launch needs a Task. Start a Task for this work first, then launch the Worker on that Task by its key; the Worker reports there.'
    ) {
        super(message);
        this.name = 'WorkerTaskRequiredError';
    }
}
