import type { MCPClient } from '@ai-sdk/mcp';
import { type TraceCarrier, withTelemetrySpan, withTraceCarrier } from '@haus/effect';
import { Data, Effect, Runtime } from 'effect';
import type { McpClientCache } from './client-cache.ts';
import { classifyMcpUpstreamError, McpClientAcquireError, McpUpstreamError } from './errors.ts';

class McpForeignOperationError extends Data.TaggedError('McpForeignOperationError')<{
    readonly cause: unknown;
}> {}

interface McpUpstreamOperation<T> {
    clients: McpClientCache;
    connectionId: string;
    operation: 'discovery' | 'invocation';
    signal?: AbortSignal;
    timeoutMs: number;
    traceContext?: TraceCarrier;
    use(client: MCPClient, signal: AbortSignal): Promise<T>;
}

export async function runMcpUpstream<T>(input: McpUpstreamOperation<T>): Promise<T> {
    try {
        return await input.clients.run(
            input.connectionId,
            (acquisition) =>
                acquisition.pipe(
                    Effect.flatMap((client) =>
                        Effect.tryPromise({
                            try: (signal) => input.use(client, signal),
                            catch: (cause) => new McpForeignOperationError({ cause }),
                        })
                    ),
                    Effect.mapError((cause) => classifyRuntimeFailure(cause, input.operation)),
                    Effect.timeoutFail({
                        duration: input.timeoutMs,
                        onTimeout: () =>
                            new McpUpstreamError(
                                'MCP_TIMEOUT',
                                `The MCP ${input.operation} timed out.`
                            ),
                    }),
                    withTelemetrySpan('haus.mcp.operation', {
                        'haus.operation': `mcp.${input.operation}`,
                    }),
                    withTraceCarrier(input.traceContext)
                ),
            input.signal
        );
    } catch (cause) {
        if (Runtime.isFiberFailure(cause)) {
            throw cause;
        }
        throw classifyRuntimeFailure(cause, input.operation);
    }
}

function classifyRuntimeFailure(
    cause: unknown,
    operation: 'discovery' | 'invocation'
): McpUpstreamError {
    if (cause instanceof McpForeignOperationError || cause instanceof McpClientAcquireError) {
        return classifyMcpUpstreamError(cause.cause, operation);
    }
    return classifyMcpUpstreamError(cause, operation);
}
