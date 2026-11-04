/**
 * A claim refusal the Agent API answers with `409 TASK_CONFLICT`. A lost claim
 * is not one: it is a per-claim result carrying the structured conflict.
 */
export class AgentClaimError extends Error {}

/** A claim-create nonce already used by a different request: `409 IDEMPOTENCY_KEY_REUSED`. */
export class AgentClaimNonceReusedError extends Error {
    constructor() {
        super('That claim creation nonce was already used for a different request.');
        this.name = 'AgentClaimNonceReusedError';
    }
}
