import * as z from 'zod';
import type { SessionFailureTurnEvent } from '../turn-event.ts';
import { AcpRequestError } from './json-rpc.ts';

/**
 * Grok reports a provider failure in-band as an `_x.ai/session_notification` `retry_state`:
 * `type: "failed"` once it gives up (the prompt then fails), otherwise a retry in progress.
 * `error_type` is Grok's own typed class, so Haus maps that and never reads the prose.
 */
const retryStateSchema = z.looseObject({
    error_type: z.string().optional(),
    message: z.string().optional(),
    sessionUpdate: z.literal('retry_state'),
    type: z.string(),
});

const categoryByErrorType: Readonly<Record<string, string>> = {
    auth: 'access',
    authentication: 'access',
    billing: 'limit',
    connection: 'connection',
    forbidden: 'access',
    network: 'connection',
    overloaded: 'service',
    permission: 'access',
    quota: 'limit',
    rate_limit: 'limit',
    rate_limited: 'limit',
    server: 'service',
    server_error: 'service',
    service_unavailable: 'service',
    timeout: 'connection',
    unauthorized: 'access',
    usage_limit: 'limit',
};

export function grokRetryStateFailure(update: unknown): SessionFailureTurnEvent | null {
    const parsed = retryStateSchema.safeParse(update);
    if (!parsed.success) {
        return null;
    }
    const errorType = parsed.data.error_type?.toLowerCase() ?? '';
    return {
        category: categoryByErrorType[errorType] ?? 'unknown',
        severity: parsed.data.type === 'failed' ? 'error' : 'warning',
        title: firstLine(parsed.data.message) ?? `Grok request ${parsed.data.type}`,
        type: 'session-failure',
    };
}

/** ACP's typed "authentication required" error is the only code-level failure class Grok uses. */
const ACP_AUTH_REQUIRED = -32_000;

export function grokRequestFailure(error: unknown): SessionFailureTurnEvent | null {
    if (!(error instanceof AcpRequestError) || error.code !== ACP_AUTH_REQUIRED) {
        return null;
    }
    return {
        category: 'access',
        severity: 'error',
        title: 'Grok Build is not signed in. Run `grok login` on this machine.',
        type: 'session-failure',
    };
}

function firstLine(text: string | undefined): string | undefined {
    const line = text
        ?.split('\n')
        .map((part) => part.trim())
        .find((part) => part.length > 0);
    return line && line.length > 0 ? line : undefined;
}
