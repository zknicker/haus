import { createHash } from 'node:crypto';
import type { Client, Tool } from '@modelcontextprotocol/client';

export function modelToolName(connectionId: string, toolName: string) {
    const hash = createHash('sha256')
        .update(`${connectionId}\0${toolName}`)
        .digest('hex')
        .slice(0, 8);
    return `${modelToolPrefix(connectionId)}${slug(toolName).slice(0, 27)}_${hash}`;
}

export function isModelToolNameOf(visibleName: string, connectionId: string): boolean {
    return visibleName.startsWith(modelToolPrefix(connectionId));
}

export interface McpRequestOptions {
    cacheMode?: 'use' | 'refresh';
    signal: AbortSignal;
    timeout: number;
}

export async function listAllTools(client: Client, options: McpRequestOptions) {
    const result = await client.listTools(undefined, options);
    if (result.tools.length > 1000) {
        throw new Error('MCP tool discovery exceeded 1,000 tools.');
    }
    return result.tools;
}

/** The upstream tool behind a model-visible name, refreshing the listing once on a miss. */
export async function findModelTool(
    client: Client,
    connectionId: string,
    visibleName: string,
    options: McpRequestOptions
): Promise<Tool | undefined> {
    const matches = (tool: Tool) => modelToolName(connectionId, tool.name) === visibleName;
    const tool = (await listAllTools(client, options)).find(matches);
    if (tool) {
        return tool;
    }
    return (await client.listTools(undefined, { ...options, cacheMode: 'refresh' })).tools.find(
        matches
    );
}

export type McpToolResult = Awaited<ReturnType<Client['callTool']>>;

/** One Agent's `tools/call` as a built-in connection's transport sees it. */
export interface McpToolCall {
    agentId: string;
    arguments: Record<string, unknown>;
    connectionId: string;
    /** The Server's invocation timeout; the call must finish inside it. */
    deadlineMs: number;
    /** `x-haus-mcp-request-id`: stable across the Computer's retries of one invocation. */
    requestId: string | undefined;
    serverId: string;
    toolName: string;
}

/**
 * A built-in connection's per-call transport (specs/linear-app.md#per-request-actor-transport):
 * it chooses each request's `_meta`, may resend once, and answers only what
 * the Agent may see. Credentials it puts in `_meta` never appear in what it
 * answers or throws.
 */
export interface McpToolCallTransport {
    call(
        call: McpToolCall,
        send: (meta: Record<string, unknown>) => Promise<McpToolResult>
    ): Promise<unknown>;
}

/** Calls the tool directly, or through its connection's transport when it has one. */
export async function callModelTool(
    client: Client,
    tool: Tool,
    call: McpToolCall,
    options: McpRequestOptions,
    transport: McpToolCallTransport | undefined
): Promise<unknown> {
    const send = (meta?: Record<string, unknown>) =>
        callMcpTool(client, {
            arguments: call.arguments,
            definition: tool,
            meta,
            name: tool.name,
            options,
        });
    return transport ? await transport.call(call, send) : await send();
}

/**
 * One `tools/call`. `meta` is request `_meta` a built-in connection's
 * transport supplies per call (it can carry a credential): it goes on the
 * wire and nowhere else.
 */
export async function callMcpTool(
    client: Client,
    request: {
        arguments: Record<string, unknown>;
        name: string;
        definition?: Tool;
        meta?: Record<string, unknown>;
        options: McpRequestOptions;
    }
) {
    return await client.callTool(
        {
            arguments: request.arguments,
            name: request.name,
            ...(request.meta ? { _meta: request.meta } : {}),
        },
        { ...request.options, toolDefinition: request.definition }
    );
}

function modelToolPrefix(connectionId: string) {
    return `mcp__${slug(connectionId).slice(0, 20)}__`;
}

function slug(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'tool';
}
