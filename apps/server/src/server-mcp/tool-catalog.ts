import { createHash } from 'node:crypto';
import type { MCPClient } from '@ai-sdk/mcp';

export function modelToolName(connectionId: string, toolName: string) {
    const slug = (value: string) =>
        value.replace(/[^a-zA-Z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'tool';
    const hash = createHash('sha256')
        .update(`${connectionId}\0${toolName}`)
        .digest('hex')
        .slice(0, 8);
    return `mcp__${slug(connectionId).slice(0, 20)}__${slug(toolName).slice(0, 27)}_${hash}`;
}

export interface McpRequestOptions {
    signal: AbortSignal;
    timeout: number;
}

/**
 * Clients whose `x-mcp-header` bindings are loaded. `@ai-sdk/mcp` derives the `Mcp-Param-*`
 * request headers for `tools/call` only from a `listTools()` on the same client instance, so a
 * cached client must list once before its first call. A rebuilt client is a new key.
 */
const boundClients = new WeakSet<MCPClient>();
/** A first-page listing clears every binding, so calls wait out an in-flight listing. */
const listings = new WeakMap<MCPClient, Promise<unknown>>();

/** Call an upstream tool after loading its header bindings, once per client lifetime. */
export async function callMcpTool(
    client: MCPClient,
    request: { arguments: Record<string, unknown>; name: string; options: McpRequestOptions }
) {
    await listings.get(client)?.catch(() => undefined);
    if (!boundClients.has(client)) {
        await listAllTools(client, request.options);
    }
    return await client.callTool(request);
}

export function listAllTools(client: MCPClient, options: McpRequestOptions) {
    boundClients.delete(client);
    const listing = listPages(client, options);
    listings.set(client, listing);
    const settle = () => {
        if (listings.get(client) === listing) {
            listings.delete(client);
        }
    };
    listing.then(settle, settle);
    return listing;
}

async function listPages(client: MCPClient, options: McpRequestOptions) {
    const tools: Awaited<ReturnType<MCPClient['listTools']>>['tools'] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 100; page += 1) {
        const result = await client.listTools({ params: { cursor }, options });
        tools.push(...result.tools);
        if (tools.length > 1000) {
            throw new Error('MCP tool discovery exceeded 1,000 tools.');
        }
        if (!result.nextCursor) {
            boundClients.add(client);
            return tools;
        }
        if (seenCursors.has(result.nextCursor)) {
            throw new Error('MCP tool discovery returned a repeated cursor.');
        }
        seenCursors.add(result.nextCursor);
        cursor = result.nextCursor;
    }
    throw new Error('MCP tool discovery exceeded 100 pages.');
}
