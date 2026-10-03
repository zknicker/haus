import { agentDescriptionTooLongMessage, isAgentDescriptionWriteAllowed } from '@haus/api';

/** The nonce already names a Message that carries a different creation. */
export class AgentCreateConflictError extends Error {
    constructor(message = 'That creation nonce already belongs to a different Agent.') {
        super(message);
        this.name = 'AgentCreateConflictError';
    }
}

/** A new Agent inherits the caller's Computer, so the caller must have one. */
export class AgentCreateNoComputerError extends Error {
    constructor() {
        super('The creating Agent has no assigned Computer to give the new Agent.');
        this.name = 'AgentCreateNoComputerError';
    }
}

/** No live Agent of this Server answers to that handle. */
export class AgentTargetNotFoundError extends Error {
    constructor(handle: string) {
        super(`No active Agent on this Server answers to "@${handle}".`);
        this.name = 'AgentTargetNotFoundError';
    }
}

/** Cove's identity is product-owned; nothing an Agent does may rewrite it. */
export class AgentIdentityProtectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AgentIdentityProtectedError';
    }
}

/**
 * The announcement does not name the new Agent, so nothing a reader can click
 * would reach it. The handle the Server derived rides the refusal, because a
 * collision may have suffixed it past what the caller could predict.
 */
export class AgentCreateAnnouncementMissingHandleError extends Error {
    constructor(readonly handle: string) {
        super(`The announcement must name the new Agent as @${handle}.`);
        this.name = 'AgentCreateAnnouncementMissingHandleError';
    }
}

/** A changed description exceeds the role-line cap; an unchanged stored one never trips this. */
export class AgentDescriptionTooLongError extends Error {
    constructor() {
        super(agentDescriptionTooLongMessage);
        this.name = 'AgentDescriptionTooLongError';
    }
}

/** Every description update path calls this with the value it is about to replace. */
export function assertAgentDescriptionWrite(next: string | null, stored: string | null): void {
    if (!isAgentDescriptionWriteAllowed(next, stored)) {
        throw new AgentDescriptionTooLongError();
    }
}
