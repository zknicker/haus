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

export async function callMcpTool(
    client: Client,
    request: {
        arguments: Record<string, unknown>;
        name: string;
        definition?: Tool;
        options: McpRequestOptions;
    }
) {
    return await client.callTool(
        { arguments: request.arguments, name: request.name },
        { ...request.options, toolDefinition: request.definition }
    );
}

function modelToolPrefix(connectionId: string) {
    return `mcp__${slug(connectionId).slice(0, 20)}__`;
}

function slug(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'tool';
}
