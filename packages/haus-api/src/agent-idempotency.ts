import * as z from 'zod';

/**
 * The idempotency key an Agent CLI create carries: a message or task `nonce`,
 * or a reminder `commandId`. The CLI mints one per invocation and resends it on
 * its own retries, so a retried request replays the first result.
 */
export const agentIdempotencyKeySchema = z.string().trim().min(1).max(128);

/** The Agent API code for a key already used by a different request. */
export const AGENT_IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';
