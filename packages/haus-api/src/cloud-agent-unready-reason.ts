import * as z from 'zod';

/**
 * Why a Cloud Agent provider is not ready on a Computer. `not-connected` — no
 * credential resolves from explicit configuration, the environment, or the
 * provider's own credential store. `expired` — a stored credential resolved
 * but its own expiry has passed, so reconnecting is the fix rather than
 * installing anything. `provider-unavailable` — the provider SDK itself cannot
 * be reached on this Computer.
 */
export const cloudAgentUnreadyReasons = [
    'not-connected',
    'expired',
    'provider-unavailable',
] as const;

export const cloudAgentUnreadyReasonSchema = z.enum(cloudAgentUnreadyReasons);

export type CloudAgentUnreadyReason = z.infer<typeof cloudAgentUnreadyReasonSchema>;
