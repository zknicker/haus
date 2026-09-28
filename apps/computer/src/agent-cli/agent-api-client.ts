import * as z from 'zod';
import { type AgentContext, resolveAgentContext } from './agent-context.ts';
import { AgentCliError } from './agent-error.ts';

const REQUEST_TIMEOUT_MS = 15_000;
const errorResponseSchema = z.object({
    code: z.string().min(1),
    draftSaved: z.boolean().optional(),
    message: z.string().min(1),
    nextAction: z.string().min(1).optional(),
    retryable: z.boolean().optional(),
});

export interface AgentApiRequest {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST';
    query?: Record<string, boolean | number | string | undefined>;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface AgentApiRequester {
    request<T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest): Promise<T>;
}

/**
 * The request got no answer at all — timed out, dropped, unreachable host — so
 * the Server may still have acted on it. An answered failure is never one of
 * these, which is what lets a caller with a stable idempotency key retry this
 * and only this.
 */
export class AgentApiTransportError extends AgentCliError {}

export class AgentApiClient implements AgentApiRequester {
    constructor(
        private readonly context: AgentContext,
        private readonly fetcher: typeof fetch = fetch
    ) {}

    async request<T>(route: string, schema: z.ZodType<T>, input: AgentApiRequest = {}): Promise<T> {
        const url = new URL(route, this.context.serverUrl);
        for (const [name, value] of Object.entries(input.query ?? {})) {
            if (value !== undefined) {
                url.searchParams.set(name, String(value));
            }
        }
        let response: Response;
        try {
            response = await this.fetcher(url, {
                ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
                headers: {
                    authorization: `Bearer ${this.context.token}`,
                    ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
                },
                method: input.method ?? 'GET',
                signal: input.signal
                    ? AbortSignal.any([
                          input.signal,
                          AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
                      ])
                    : AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
            });
        } catch {
            throw transportFailure();
        }
        if (!response.ok) {
            let payload: unknown;
            try {
                payload = await response.json();
            } catch {
                throw response.status >= 500 ? serverFailure() : invalidJson();
            }
            const parsedError = errorResponseSchema.safeParse(payload);
            if (!parsedError.success) {
                throw response.status >= 500 ? serverFailure() : invalidJson();
            }
            throw new AgentCliError(parsedError.data.code, parsedError.data.message, {
                draftSaved: parsedError.data.draftSaved,
                nextAction: parsedError.data.nextAction,
                retryable: parsedError.data.retryable,
            });
        }
        const payload = await readJson(response);
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
            throw invalidJson();
        }
        return parsed.data;
    }
}

export function createAgentApiClient(): AgentApiClient {
    return new AgentApiClient(resolveAgentContext());
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        throw invalidJson();
    }
}

function invalidJson(): AgentCliError {
    return new AgentCliError('INVALID_JSON_RESPONSE', 'The server returned invalid JSON.', {
        nextAction: 'Retry the command. If it fails again, check the Haus Computer logs.',
    });
}

function serverFailure(): AgentCliError {
    return new AgentCliError('SERVER_5XX', 'The Haus server is unavailable.', {
        nextAction: 'Retry after the Haus Server is reachable.',
    });
}

function transportFailure(): AgentApiTransportError {
    return new AgentApiTransportError('SERVER_5XX', 'The Haus server is unavailable.', {
        nextAction: 'Retry after the Haus Server is reachable.',
    });
}
