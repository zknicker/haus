/**
 * A runtime rejected the stored resume state (`RuntimeResumeRejectedError`); the caller rotates
 * the generation and cold-starts once.
 */
export class AgentSessionResumeRejectedError extends Error {
    constructor(
        readonly agentId: string,
        options?: { cause?: unknown }
    ) {
        super(`Agent ${agentId} could not resume its stored runtime session.`, options);
        this.name = 'AgentSessionResumeRejectedError';
    }
}
