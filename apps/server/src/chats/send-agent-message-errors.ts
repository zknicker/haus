export class AgentSendConflictError extends Error {
    constructor() {
        super('That message nonce already belongs to a different Agent send.');
        this.name = 'AgentSendConflictError';
    }
}

export class AgentMessageContentTooLongError extends Error {
    constructor() {
        super('The message is too long after rich references are resolved.');
        this.name = 'AgentMessageContentTooLongError';
    }
}
