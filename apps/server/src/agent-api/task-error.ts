/**
 * A task refusal the Agent API answers with `409 TASK_CONFLICT`. A lost claim
 * is not one: it is a per-task claim result carrying the structured conflict.
 */
export class AgentTaskError extends Error {}

/** A task-create nonce already used by a different request: `409 IDEMPOTENCY_KEY_REUSED`. */
export class AgentTaskNonceReusedError extends Error {
    constructor() {
        super('That task creation nonce was already used for a different request.');
        this.name = 'AgentTaskNonceReusedError';
    }
}
