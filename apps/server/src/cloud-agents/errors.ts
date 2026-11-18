export class CloudAgentWorkConflictError extends Error {
    constructor(message = 'That Cloud Agent nonce already belongs to a different Message.') {
        super(message);
        this.name = 'CloudAgentWorkConflictError';
    }
}

export class CloudAgentNotLaunchedError extends Error {
    constructor() {
        super(
            'This Cloud Agent has no provider identity yet. Wait for its initial launch before sending a follow-up.'
        );
        this.name = 'CloudAgentNotLaunchedError';
    }
}

export class CloudAgentAgentNotFoundError extends Error {
    constructor() {
        super('The delegating Agent no longer exists.');
        this.name = 'CloudAgentAgentNotFoundError';
    }
}

export class CloudAgentWorkNotFoundError extends Error {
    constructor() {
        super('That Cloud Agent work does not exist.');
        this.name = 'CloudAgentWorkNotFoundError';
    }
}

export class CloudAgentWorkSettledError extends Error {
    constructor() {
        super('That Cloud Agent work has already settled.');
        this.name = 'CloudAgentWorkSettledError';
    }
}

export class CloudAgentCancelDeniedError extends Error {
    constructor() {
        super('Only the delegating Agent, an Owner, or an Admin may cancel Cloud Agent work.');
        this.name = 'CloudAgentCancelDeniedError';
    }
}

/** The work outlives its removed Computer, but nothing can reach its provider now. */
export class CloudAgentComputerRemovedError extends Error {
    constructor() {
        super(
            'The Computer that launched this Cloud Agent work was removed, so Haus can no longer reach it.'
        );
        this.name = 'CloudAgentComputerRemovedError';
    }
}

/**
 * Cloud work attaches to a Task and reports there (ADR 0052 decision 6), so a
 * launch that names no Task, or one the Agent cannot reach, is refused.
 */
export class CloudAgentTaskRequiredError extends Error {
    constructor(
        message = 'A cloud agent launch needs a Task. Start a Task for this work first, then launch the cloud agent on that Task by its key; the cloud agent reports there.'
    ) {
        super(message);
        this.name = 'CloudAgentTaskRequiredError';
    }
}
