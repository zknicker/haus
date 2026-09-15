import { agentMcpCatalogQuerySchema, agentMcpInvocationSchema } from '@haus/api';
import { parseTraceCarrier } from '@haus/effect';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpCatalogResponse } from '../server-mcp/catalog-response.ts';
import { McpDeniedError, McpUpstreamError } from '../server-mcp/errors.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { registerMcpCancellation } from './mcp-cancellation.ts';

export function registerAgentMcpRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; runtime: McpRuntime }
) {
    const beginRequest = registerMcpCancellation(app, options.db);
    app.get('/api/agent/mcp/tools', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const cancellation = beginRequest(request);
        if (!cancellation) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'A valid MCP request id is required.'
            );
        }
        try {
            const query = agentMcpCatalogQuerySchema.safeParse(request.query);
            if (!query.success) {
                return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid MCP catalog query.');
            }
            const tools = await options.runtime.listAgentTools(
                runner.serverId,
                runner.agentId,
                readTraceContext(request.headers.traceparent),
                cancellation.signal
            );
            return mcpCatalogResponse(tools, query.data);
        } catch (cause) {
            return sendAgentApiError(
                reply,
                502,
                'MCP_UNAVAILABLE',
                cause instanceof Error ? cause.message : 'MCP tools are unavailable.'
            );
        } finally {
            cancellation.dispose();
        }
    });

    app.post('/api/agent/mcp/invoke', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        const parsed = agentMcpInvocationSchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The MCP invocation was invalid.');
        }
        const cancellation = beginRequest(request);
        if (!cancellation) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'A valid MCP request id is required.'
            );
        }
        try {
            return {
                result: await options.runtime.invoke({
                    agentId: runner.agentId,
                    signal: cancellation.signal,
                    args: parsed.data.args,
                    serverId: runner.serverId,
                    toolName: parsed.data.toolName,
                    traceContext: readTraceContext(request.headers.traceparent),
                }),
            };
        } catch (cause) {
            return sendInvocationError(reply, cause);
        } finally {
            cancellation.dispose();
        }
    });
}

function readTraceContext(header: string | string[] | undefined) {
    if (typeof header !== 'string') {
        return undefined;
    }
    const carrier = { traceparent: header };
    return parseTraceCarrier(carrier) ? carrier : undefined;
}

function sendInvocationError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof McpDeniedError) {
        return sendAgentApiError(reply, 403, cause.code, cause.message);
    }
    if (cause instanceof McpUpstreamError) {
        return sendAgentApiError(
            reply,
            cause.code === 'MCP_TIMEOUT' ? 504 : 502,
            cause.code,
            cause.message
        );
    }
    return sendAgentApiError(
        reply,
        502,
        'MCP_UNAVAILABLE',
        cause instanceof Error ? cause.message : 'MCP invocation is unavailable.'
    );
}
