import { type ClaudeUsageSnapshot, normalizeClaudeUsageResponse } from '@haus/claude-usage';
import * as z from 'zod';
import type { ClaudeConnection } from './claude-connection.ts';

/** Turns that claim a plan-usage refresh carry this in their launch env (executor). */
export const CLAUDE_USAGE_REFRESH_ENV = 'HAUS_CLAUDE_USAGE_REFRESH';

const usageRequestTimeoutMs = 10_000;

const usageResponseSchema = z.looseObject({
    rate_limits: z.unknown().optional(),
    rate_limits_available: z.boolean().optional(),
    subscription_type: z.string().nullish(),
});

/**
 * The subscription's rate-limit windows after a turn, from Claude Code's `get_usage` control
 * request (what the bridge read through the Agent SDK). `null` when the login has none.
 */
export async function readClaudePlanUsage(
    connection: Pick<ClaudeConnection, 'control'>
): Promise<ClaudeUsageSnapshot | null> {
    let response: unknown;
    try {
        response = await connection.control({ subtype: 'get_usage' }, usageRequestTimeoutMs);
    } catch {
        // Usage evidence is auxiliary; a turn never fails for it (the bridge's rule).
        return null;
    }
    return claudePlanUsageFromResponse(response);
}

export function claudePlanUsageFromResponse(response: unknown): ClaudeUsageSnapshot | null {
    const parsed = usageResponseSchema.safeParse(response);
    if (!(parsed.success && parsed.data.rate_limits_available === true)) {
        return null;
    }
    try {
        return normalizeClaudeUsageResponse(parsed.data.rate_limits, {
            source: 'claude-code-sdk-usage',
            subscriptionType: parsed.data.subscription_type ?? null,
        });
    } catch {
        // A rate-limit shape this release does not know is no usage evidence, not a failure.
        return null;
    }
}
