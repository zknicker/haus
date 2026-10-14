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

export class CloudAgentCancelUnsupportedError extends Error {
    constructor() {
        super(
            'Claude Cloud cancellation requires stopping the session in Claude. Open the provider page to stop it.'
        );
        this.name = 'CloudAgentCancelUnsupportedError';
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
