import * as z from 'zod';
import { McpResponseTooLargeError, readMcpResponseText } from './mcp-response.ts';

const errorSchema = z.object({
    code: z
        .enum(['MCP_AUTH_REQUIRED', 'MCP_DENIED', 'MCP_TIMEOUT', 'MCP_UNAVAILABLE'])
        .catch('MCP_UNAVAILABLE'),
    message: z.string().min(1).optional().catch(undefined),
});

export type ServerMcpErrorCode = z.infer<typeof errorSchema>['code'];

export class ServerMcpToolError extends Error {
    constructor(
        readonly code: ServerMcpErrorCode,
        message: string,
        readonly status: number,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'ServerMcpToolError';
    }
}

/**
 * Read a Server MCP route response. Every unreadable, non-JSON, or untyped failure becomes a
 * `ServerMcpToolError` naming the HTTP status, so an edge-rewritten HTML page still reaches the
 * Agent as a typed error instead of a parse exception.
 */
export async function readServerMcpPayload(
    response: Response,
    signal: AbortSignal
): Promise<unknown> {
    const { status } = response;
    let text: string;
    try {
        text = await readMcpResponseText(response);
    } catch (cause) {
        signal.throwIfAborted();
        throw new ServerMcpToolError(
            'MCP_UNAVAILABLE',
            cause instanceof McpResponseTooLargeError
                ? cause.message
                : `The Server MCP response could not be read (HTTP ${status}).`,
            status,
            { cause }
        );
    }
    const payload = parseJson(text);
    if (response.ok && payload !== undefined) {
        return payload;
    }
    const error = response.ok ? undefined : errorSchema.safeParse(payload).data;
    if (error) {
        const message = error.message ?? `The Server MCP request failed (HTTP ${status}).`;
        throw new ServerMcpToolError(error.code, message, status);
    }
    throw new ServerMcpToolError(
        'MCP_UNAVAILABLE',
        `The Server MCP request returned ${payload === undefined ? 'a non-JSON' : 'an untyped'} response (HTTP ${status}).`,
        status
    );
}

/** Validate a successful payload; a shape mismatch is a Server contract failure, not bad args. */
export function parseServerMcpResult<T>(schema: z.ZodType<T>, payload: unknown): T {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new ServerMcpToolError(
            'MCP_UNAVAILABLE',
            'The Server MCP response had an unexpected shape.',
            200,
            { cause: parsed.error }
        );
    }
    return parsed.data;
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        // Non-JSON bodies (edge error pages, truncated streams) are reported by status above.
        return undefined;
    }
}
