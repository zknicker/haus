import * as z from 'zod';
import { LinearToolError } from './tool-error.ts';

export const linearGraphqlEndpoint = 'https://api.linear.app/graphql';

export interface LinearGraphql {
    request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

/** A create whose client id Linear already holds; the caller reads the entity back. */
export class LinearAlreadyExistsError extends LinearToolError {
    constructor(message: string) {
        super('linear_input_error', message);
    }
}

const graphqlErrorSchema = z.object({
    extensions: z
        .object({
            code: z.string().optional(),
            type: z.string().optional(),
            userPresentableMessage: z.string().optional(),
        })
        .loose()
        .optional(),
    message: z.string(),
});
const graphqlResponseSchema = z.object({
    data: z.record(z.string(), z.unknown()).nullable().optional(),
    errors: z.array(graphqlErrorSchema).optional(),
});

/** One actor's Linear GraphQL client for one call; the token never leaves the request. */
export function createLinearGraphql(options: {
    accessToken: string;
    fetch?: typeof fetch;
    signal: AbortSignal;
}): LinearGraphql {
    const send = options.fetch ?? fetch;
    return {
        async request<T>(query: string, variables: Record<string, unknown> = {}) {
            let response: Response;
            try {
                response = await send(linearGraphqlEndpoint, {
                    body: JSON.stringify({ query, variables }),
                    headers: {
                        Authorization: `Bearer ${options.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                    redirect: 'error',
                    signal: options.signal,
                });
            } catch {
                throw upstream(options.signal);
            }
            if (response.status === 401) {
                throw new LinearToolError('linear_token_rejected', 'Linear rejected the token.');
            }
            const parsed = graphqlResponseSchema.safeParse(
                await readJson(response, options.signal)
            );
            const firstError = parsed.success ? parsed.data.errors?.[0] : undefined;
            if (response.status === 429 || isCode(firstError, 'RATELIMITED')) {
                throw new LinearToolError(
                    'linear_rate_limited',
                    'Linear rate limit reached; retry after the reset time.',
                    resetAt(response)
                );
            }
            if (response.status >= 500 || !parsed.success) {
                throw new LinearToolError(
                    'linear_upstream_error',
                    'Linear answered with an error.'
                );
            }
            if (firstError) {
                throw mapGraphqlError(firstError);
            }
            if (!(response.ok && parsed.data.data)) {
                throw new LinearToolError('linear_upstream_error', 'Linear returned no data.');
            }
            return parsed.data.data as T;
        },
    };
}

function mapGraphqlError(error: z.infer<typeof graphqlErrorSchema>): LinearToolError {
    if (isCode(error, 'AUTHENTICATION_ERROR')) {
        return new LinearToolError('linear_token_rejected', 'Linear rejected the token.');
    }
    const message = error.extensions?.userPresentableMessage ?? error.message;
    if (/already exists/iu.test(error.message) || /already exists/iu.test(message)) {
        return new LinearAlreadyExistsError(message);
    }
    if (isCode(error, 'INTERNAL_ERROR')) {
        return new LinearToolError('linear_upstream_error', 'Linear answered with an error.');
    }
    return new LinearToolError('linear_input_error', message);
}

function isCode(error: z.infer<typeof graphqlErrorSchema> | undefined, code: string) {
    const extensions = error?.extensions;
    return (
        extensions?.code === code || extensions?.type?.toUpperCase().replaceAll(' ', '_') === code
    );
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        if (signal.aborted) {
            throw upstream(signal);
        }
        return null;
    }
}

function upstream(signal: AbortSignal) {
    return new LinearToolError(
        'linear_upstream_error',
        signal.aborted
            ? 'Linear did not answer before the call deadline.'
            : 'Linear could not be reached.'
    );
}

function resetAt(response: Response): string | null {
    const reset = Number(response.headers.get('x-ratelimit-requests-reset'));
    return Number.isFinite(reset) && reset > 0 ? new Date(reset).toISOString() : null;
}
