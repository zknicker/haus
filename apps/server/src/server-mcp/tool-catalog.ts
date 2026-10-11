import { createHash } from 'node:crypto';
import type { MCPClient } from '@ai-sdk/mcp';

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
    signal: AbortSignal;
    timeout: number;
}

export type McpToolCallResult = Awaited<ReturnType<MCPClient['callTool']>>;

export type ModelToolCall =
    | { readonly kind: 'called'; readonly result: McpToolCallResult }
    | { readonly kind: 'absent' }
    | { readonly kind: 'revoked' };

/** Presence means this client's `x-mcp-header` bindings are loaded. */
const listedNames = new WeakMap<MCPClient, readonly string[]>();
const listings = new WeakMap<MCPClient, Promise<unknown>>();
const listGenerations = new WeakMap<MCPClient, number>();

export async function callModelTool(
    client: MCPClient,
    request: {
        arguments: Record<string, unknown>;
        connectionId: string;
        options: McpRequestOptions;
        stillGranted: () => Promise<boolean>;
        visibleName: string;
    }
): Promise<ModelToolCall> {
    const known = await settledNames(client);
    let upstreamName = known === null ? null : findUpstreamName(known, request);
    if (upstreamName === null) {
        const fresh = await listAllTools(client, request.options);
        upstreamName = findUpstreamName(
            fresh.map((tool) => tool.name),
            request
        );
    }
    if (upstreamName === null) {
        return { kind: 'absent' };
    }
    if (!(await request.stillGranted())) {
        return { kind: 'revoked' };
    }
    return {
        kind: 'called',
        result: await callMcpTool(client, {
            arguments: request.arguments,
            name: upstreamName,
            options: request.options,
        }),
    };
}

/** Call an upstream tool after loading its header bindings, once per client lifetime. */
export async function callMcpTool(
    client: MCPClient,
    request: { arguments: Record<string, unknown>; name: string; options: McpRequestOptions }
) {
    const listing = listings.get(client);
    if (listing) {
        // A failed listing leaves the client unbound; the check below lists again.
        await Promise.allSettled([listing]);
    }
    if (!listedNames.has(client)) {
        await listAllTools(client, request.options);
    }
    return await client.callTool(request);
}

export function listAllTools(client: MCPClient, options: McpRequestOptions) {
    const generation = (listGenerations.get(client) ?? 0) + 1;
    listGenerations.set(client, generation);
    listedNames.delete(client);
    const listing = listPages(client, options);
    listings.set(client, listing);
    const settle = () => {
        if (listings.get(client) === listing) {
            listings.delete(client);
        }
    };
    listing.then((tools) => {
        settle();
        if (listGenerations.get(client) === generation) {
            listedNames.set(
                client,
                tools.map((tool) => tool.name)
            );
        }
    }, settle);
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

function modelToolPrefix(connectionId: string) {
    return `mcp__${slug(connectionId).slice(0, 20)}__`;
}

function slug(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'tool';
}

function findUpstreamName(
    names: readonly string[],
    request: { connectionId: string; visibleName: string }
) {
    return (
        names.find((name) => modelToolName(request.connectionId, name) === request.visibleName) ??
        null
    );
}

async function settledNames(client: MCPClient): Promise<readonly string[] | null> {
    const listing = listings.get(client);
    if (listing) {
        await Promise.allSettled([listing]);
    }
    return listedNames.get(client) ?? null;
}
