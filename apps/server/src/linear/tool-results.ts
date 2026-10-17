import { inspect } from 'node:util';
import type { McpToolResult } from '../server-mcp/tool-catalog.ts';
import { LinearApiError } from './linear-api.ts';
import { LinearRefusedError } from './linear-errors.ts';
import { LinearArtifactUnavailableError } from './signed-urls.ts';

// Linear tool results as the Agent sees them (specs/linear-app.md#error-codes):
// a refusal is an error result whose text leads with its stable code, and no
// result or error ever carries a credential.

export type LinearToolRefusalCode =
    | 'linear_agent_unknown'
    | 'linear_input_error'
    | 'linear_session_actor_unavailable'
    | 'linear_session_closed'
    | 'linear_session_not_yours'
    | 'linear_sign_in_required'
    | 'linear_team_membership_required'
    | 'linear_team_outside_access';

/** Why the Server refused a call before it reached the connector. */
export interface LinearToolRefusal {
    detail?: string;
    refused: LinearToolRefusalCode;
}

const refusalMessages: Record<LinearToolRefusalCode, string> = {
    linear_agent_unknown: 'That names no single Haus Agent granted Linear.',
    linear_input_error: 'Linear refused the input.',
    linear_session_actor_unavailable:
        "This session's Linear identity cannot post on its issue's team.",
    linear_session_closed: 'That Linear session is closed.',
    linear_session_not_yours: 'That Linear session is not yours.',
    linear_sign_in_required: 'Linear needs an Owner to reconnect it in Haus.',
    linear_team_membership_required:
        "Haus isn't a member of a team this write changes in Linear, so it can't change that team's settings. A workspace admin can add it under Linear → Settings → Applications → Haus → Team access.",
    linear_team_outside_access:
        "A team this write touches is outside the Haus app's Linear access.",
};

export function refusalResult(refusal: LinearToolRefusal) {
    return toolError(refusal.refused, refusal.detail ?? refusalMessages[refusal.refused]);
}

export function toolError(code: string, message: string) {
    return { content: [{ text: `${code}: ${message}`, type: 'text' }], isError: true };
}

/** A Server-side Linear failure as the Agent's tool result; anything else is rethrown. */
export function linearFailure(cause: unknown) {
    if (cause instanceof LinearArtifactUnavailableError) {
        // Its message already leads with `linear_artifact_unavailable: `.
        return { content: [{ text: cause.message, type: 'text' }], isError: true };
    }
    if (cause instanceof LinearRefusedError) {
        return cause.reason === 'linear_sign_in_required'
            ? refusalResult({ refused: 'linear_sign_in_required' })
            : toolError(cause.reason, cause.message);
    }
    if (!(cause instanceof LinearApiError)) {
        throw cause;
    }
    switch (cause.failure) {
        case 'input':
            return refusalResult({
                detail: cause.presentable ?? undefined,
                refused: 'linear_input_error',
            });
        case 'rate_limited':
            return toolError(
                'linear_rate_limited',
                'Linear rate-limited this request. Try again shortly.'
            );
        case 'invalid_grant':
        case 'unauthorized':
            return refusalResult({ refused: 'linear_sign_in_required' });
        default:
            return toolError('linear_upstream_error', 'Linear is unavailable. Try again shortly.');
    }
}

/** The connector answers a Linear `401` with `linear_token_rejected` and does not retry. */
export function tokenRejected(result: McpToolResult): boolean {
    if (result.isError !== true) {
        return false;
    }
    const [first] = Array.isArray(result.content) ? result.content : [];
    return (
        typeof first === 'object' &&
        first !== null &&
        first.type === 'text' &&
        typeof first.text === 'string' &&
        first.text.startsWith('linear_token_rejected')
    );
}

/** Result `_meta` is where the connector reports writes; it never reaches Computer. */
export function redactResult(result: unknown, tokens: ReadonlySet<string>): unknown {
    const stripped =
        typeof result === 'object' && result !== null && '_meta' in result
            ? Object.fromEntries(Object.entries(result).filter(([key]) => key !== '_meta'))
            : result;
    if (containsToken(JSON.stringify(stripped) ?? '', tokens)) {
        return toolError(
            'linear_upstream_error',
            'The Linear connector answered with a credential.'
        );
    }
    return stripped;
}

/** An error that mentions a token anywhere (message, stack, causes) is replaced by a redacted one. */
export function redactError(cause: unknown, tokens: ReadonlySet<string>): unknown {
    if (!containsToken(inspect(cause, { depth: 6 }), tokens)) {
        return cause;
    }
    let message = cause instanceof Error ? cause.message : 'The Linear call failed.';
    for (const token of tokens) {
        message = message.replaceAll(token, '[redacted]');
    }
    return new Error(message);
}

function containsToken(text: string, tokens: ReadonlySet<string>): boolean {
    for (const token of tokens) {
        if (token && text.includes(token)) {
            return true;
        }
    }
    return false;
}
