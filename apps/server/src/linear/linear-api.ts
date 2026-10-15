import * as z from 'zod';
import { linearTransport } from './linear-api-origin.ts';

// Linear's OAuth and GraphQL endpoints as the Server calls them
// (specs/linear-app.md#tokens). Only the Server holds Linear tokens; no
// response body, token, or URL with a token ever enters an error message.

export const linearAuthorizeUrl = 'https://linear.app/oauth/authorize';
const tokenUrl = 'https://api.linear.app/oauth/token';
const revokeUrl = 'https://api.linear.app/oauth/revoke';
const graphqlUrl = 'https://api.linear.app/graphql';
const requestTimeoutMs = 15_000;

/** Every install asks for exactly these; app actors cannot hold `admin`. */
export const linearAppScopes = ['read', 'write', 'app:assignable', 'app:mentionable'] as const;

/**
 * The Haus Linear app as the running Server holds it: its public client id,
 * the public origin callback and webhook URLs are built on, and the HTTP
 * transport (tests point it at a fake Linear). Null wherever it is unconfigured.
 */
export interface LinearApp {
    clientId: string;
    fetch: typeof fetch;
    publicOrigin: string;
}

export function linearAppFromEnvironment(environment: {
    HAUS_APP_ORIGIN: string;
    HAUS_LINEAR_API_ORIGIN?: string;
    HAUS_LINEAR_APP_CLIENT_ID?: string;
    HAUS_LINEAR_PUBLIC_ORIGIN?: string;
}): LinearApp | null {
    if (!environment.HAUS_LINEAR_APP_CLIENT_ID) {
        return null;
    }
    return {
        clientId: environment.HAUS_LINEAR_APP_CLIENT_ID,
        fetch: linearTransport(environment.HAUS_LINEAR_API_ORIGIN),
        publicOrigin: (
            environment.HAUS_LINEAR_PUBLIC_ORIGIN ?? environment.HAUS_APP_ORIGIN
        ).replace(/\/$/u, ''),
    };
}

/** Why a Linear call failed, without any upstream text that could carry a secret. */
export type LinearApiFailure =
    | 'input'
    | 'invalid_grant'
    | 'rate_limited'
    | 'unauthorized'
    | 'upstream';

export class LinearApiError extends Error {
    constructor(
        readonly failure: LinearApiFailure,
        message: string,
        /** Linear's `userPresentableMessage` for an input error; safe to show. */
        readonly presentable: string | null = null
    ) {
        super(message);
        this.name = 'LinearApiError';
    }
}

export interface LinearTokenPair {
    accessExpiresAt: Date;
    accessToken: string;
    refreshToken: string;
    scopes: string[];
}

const tokenResponseSchema = z.object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
    refresh_token: z.string().min(1),
    scope: z.union([z.string(), z.array(z.string())]).optional(),
});

/** Authorization code with PKCE; Haus stores no client secret. */
export async function exchangeLinearCode(
    transport: typeof fetch,
    input: { clientId: string; code: string; codeVerifier: string; now: Date; redirectUri: string }
): Promise<LinearTokenPair> {
    return await tokenRequest(transport, input.now, {
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
    });
}

/** Refresh tokens rotate on use: the answer carries a new pair. */
export async function refreshLinearToken(
    transport: typeof fetch,
    input: { clientId: string; now: Date; refreshToken: string }
): Promise<LinearTokenPair> {
    return await tokenRequest(transport, input.now, {
        client_id: input.clientId,
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
    });
}

/** Revoking a revoked token succeeds, so a repeat is harmless. */
export async function revokeLinearToken(
    transport: typeof fetch,
    input: { clientId: string; token: string }
): Promise<void> {
    const response = await send(transport, revokeUrl, {
        body: new URLSearchParams({ client_id: input.clientId, token: input.token }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok && response.status !== 400) {
        throw upstreamStatus('revoke', response.status);
    }
}

const graphqlErrorSchema = z.object({
    extensions: z
        .object({
            code: z.string().optional(),
            type: z.string().optional(),
            userPresentableMessage: z.string().optional(),
        })
        .optional(),
});
const graphqlResponseSchema = z.object({
    data: z.unknown().optional(),
    errors: z.array(graphqlErrorSchema).optional(),
});

/** One GraphQL operation with a bearer token; `data` is parsed by the caller's schema. */
export async function linearGraphql<T>(
    transport: typeof fetch,
    token: string,
    request: { query: string; variables?: Record<string, unknown> },
    data: z.ZodType<T>
): Promise<T> {
    const response = await send(transport, graphqlUrl, {
        body: JSON.stringify(request),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    if (response.status === 401) {
        throw new LinearApiError('unauthorized', 'Linear rejected the access token.');
    }
    if (response.status >= 500) {
        throw upstreamStatus('graphql', response.status);
    }
    const body = graphqlResponseSchema.safeParse(await response.json().catch(() => null));
    if (!body.success) {
        throw new LinearApiError('upstream', 'Linear answered with an unreadable body.');
    }
    const [error] = body.data.errors ?? [];
    if (error) {
        throw graphqlFailure(error);
    }
    const parsed = data.safeParse(body.data.data);
    if (!parsed.success) {
        throw new LinearApiError('upstream', 'Linear answered with an unexpected shape.');
    }
    return parsed.data;
}

async function tokenRequest(
    transport: typeof fetch,
    now: Date,
    form: Record<string, string>
): Promise<LinearTokenPair> {
    const response = await send(transport, tokenUrl, {
        body: new URLSearchParams(form),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const error = z.object({ error: z.string() }).safeParse(body);
        if (error.success && error.data.error === 'invalid_grant') {
            throw new LinearApiError('invalid_grant', 'Linear rejected the grant.');
        }
        throw response.status >= 500
            ? upstreamStatus('token', response.status)
            : new LinearApiError('input', `Linear refused the token request (${response.status}).`);
    }
    const parsed = tokenResponseSchema.safeParse(body);
    if (!parsed.success) {
        throw new LinearApiError('upstream', 'Linear answered the token request unexpectedly.');
    }
    const scope = parsed.data.scope ?? [];
    return {
        accessExpiresAt: new Date(now.getTime() + parsed.data.expires_in * 1000),
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        scopes: (Array.isArray(scope) ? scope : scope.split(/[\s,]+/u)).filter(Boolean),
    };
}

async function send(
    transport: typeof fetch,
    url: string,
    init: { body: BodyInit; headers: Record<string, string> }
): Promise<Response> {
    try {
        return await transport(url, {
            ...init,
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(requestTimeoutMs),
        });
    } catch (cause) {
        // The cause can name the URL and headers; only its kind survives.
        throw new LinearApiError(
            'upstream',
            cause instanceof Error && cause.name === 'TimeoutError'
                ? 'Linear did not answer in time.'
                : 'Linear could not be reached.'
        );
    }
}

function graphqlFailure(error: z.infer<typeof graphqlErrorSchema>): LinearApiError {
    const code = error.extensions?.code ?? error.extensions?.type ?? '';
    if (/^RATELIMITED$/iu.test(code)) {
        return new LinearApiError('rate_limited', 'Linear rate-limited the request.');
    }
    if (/AUTHENTICATION/iu.test(code)) {
        return new LinearApiError('unauthorized', 'Linear rejected the access token.');
    }
    const presentable = error.extensions?.userPresentableMessage ?? null;
    return new LinearApiError('input', 'Linear refused the request.', presentable);
}

function upstreamStatus(operation: string, status: number) {
    return new LinearApiError('upstream', `Linear ${operation} answered HTTP ${status}.`);
}
