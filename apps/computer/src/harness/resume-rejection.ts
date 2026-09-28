/** Resume was rejected; the caller rotates the generation and cold-starts once. */
export class AgentSessionResumeRejectedError extends Error {
    constructor(
        readonly agentId: string,
        options?: { cause?: unknown }
    ) {
        super(`Agent ${agentId} could not resume its stored runtime session.`, options);
        this.name = 'AgentSessionResumeRejectedError';
    }
}

/**
 * Evidence that stored resume state itself is unusable: the runtime session is missing, the
 * state no longer fits the adapter, or the provider rejects the replayed history. Anything
 * else (network, auth, rate limit, timeout) keeps the session and retries it.
 */
const promptResumeRejectionPatterns = [
    // Claude Code: the stored conversation no longer exists.
    /No conversation found with session ID/iu,
    // Pi: the provider rejects a replay that ends on an assistant message.
    /Cannot continue from message role:\s*assistant/iu,
];

const resumeRejectionPatterns = [
    ...promptResumeRejectionPatterns,
    // Codex app-server: the stored thread's rollout is gone.
    /no rollout found for (?:thread|conversation) id/iu,
    // ACP runtimes: the stored session id is unknown to the agent. Creation-only: MCP servers
    // answer an expired tool session with the same words mid-turn.
    /\bsession not found\b/iu,
    // AI SDK Harness: stored lifecycle state does not validate for this adapter.
    /Lifecycle state (?:has unexpected|was produced by harness|failed schema validation)/iu,
    /ACP lifecycle state (?:was produced by|is incompatible|belongs to sandbox|data is missing)/iu,
];

/** A failure creating a session from stored resume state. */
export function isResumeRejection(error: unknown): boolean {
    const message = errorText(error);
    return resumeRejectionPatterns.some((pattern) => pattern.test(message));
}

/** A failure once prompted: only runtime-specific evidence, never generic tool-borne text. */
export function isPromptResumeRejection(error: unknown): boolean {
    const message = errorText(error);
    return promptResumeRejectionPatterns.some((pattern) => pattern.test(message));
}

// Stream error parts arrive as plain objects, often wrapped in a cause chain.
function errorText(error: unknown, depth = 0): string {
    if (typeof error === 'string') {
        return error;
    }
    if (depth > 4 || !error || typeof error !== 'object') {
        return '';
    }
    const value = error as { cause?: unknown; error?: unknown; message?: unknown };
    return [
        typeof value.message === 'string' ? value.message : '',
        errorText(value.cause, depth + 1),
        errorText(value.error, depth + 1),
    ].join(' ');
}
