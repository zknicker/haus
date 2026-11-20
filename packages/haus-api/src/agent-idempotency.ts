import * as z from 'zod';
import { dispatchIdOf, dispatchKeySchema } from './runner-protocol.ts';

/**
 * The idempotency key an Agent CLI create carries: a message or claim `nonce`,
 * or a reminder `commandId`. The CLI mints one per invocation and resends it on
 * its own retries, so a retried request replays the first result.
 */
export const agentIdempotencyKeySchema = z.string().trim().min(1).max(128);

/** The Agent API code for a key already used by a different request. */
export const AGENT_IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';

/**
 * The Agent API code for a dispatch whose first attempt never finished: the Server stopped
 * mid-request, so whether its effect landed is unknown and the request never runs again.
 */
export const AGENT_DISPATCH_OUTCOME_UNKNOWN = 'DISPATCH_OUTCOME_UNKNOWN';

/** The header that makes a mutating Agent API request run at most once per Agent. */
export const AGENT_DISPATCH_ID_HEADER = 'haus-dispatch-id';

/** Parses `<runId>:<toolCallId>:<seq>`, accepting only the canonical spelling `dispatchIdOf` writes. */
export function parseDispatchId(value: string) {
    const first = value.indexOf(':');
    const last = value.lastIndexOf(':');
    if (first < 0 || last === first) {
        return null;
    }
    const parsed = dispatchKeySchema.safeParse({
        runId: value.slice(0, first),
        seq: Number(value.slice(last + 1)),
        toolCallId: value.slice(first + 1, last),
    });
    return parsed.success && dispatchIdOf(parsed.data) === value ? parsed.data : null;
}
