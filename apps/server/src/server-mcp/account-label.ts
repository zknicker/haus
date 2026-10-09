import type { MCPClient } from '@ai-sdk/mcp';
import type { McpPreset } from '@haus/api';
import { callMcpTool } from './tool-catalog.ts';

interface LabelContext {
    preset: McpPreset | null;
    signal: AbortSignal;
    timeout: number;
    tools: readonly string[];
}

type PresetLabelReader = (client: MCPClient, context: LabelContext) => Promise<string | null>;

const presetLabelReaders: Partial<Record<McpPreset, PresetLabelReader>> = {
    github: readGitHubLogin,
};

/**
 * The account label shown for a connection. A preset may resolve the signed-in identity over its
 * own authenticated MCP client; anything else, or any failure there, falls back to the upstream
 * server's advertised name. A label never fails discovery.
 */
export async function resolveAccountLabel(
    client: MCPClient,
    context: LabelContext
): Promise<string> {
    const reader = context.preset ? presetLabelReaders[context.preset] : undefined;
    const label = reader ? await reader(client, context).catch(() => null) : null;
    return label ?? client.serverInfo.name;
}

/** github-mcp-server's `get_me` returns the authenticated user as JSON text: `{"login": ...}`. */
async function readGitHubLogin(client: MCPClient, context: LabelContext) {
    if (!context.tools.includes('get_me')) {
        return null;
    }
    const result = await callMcpTool(client, {
        arguments: {},
        name: 'get_me',
        options: { signal: context.signal, timeout: context.timeout },
    });
    if (result.isError === true) {
        return null;
    }
    return loginOf(result.structuredContent) ?? loginOf(firstJsonText(result.content));
}

function firstJsonText(content: unknown): unknown {
    if (!Array.isArray(content)) {
        return null;
    }
    for (const block of content) {
        const text = (block as { text?: unknown; type?: unknown } | null)?.text;
        if ((block as { type?: unknown } | null)?.type === 'text' && typeof text === 'string') {
            try {
                return JSON.parse(text);
            } catch {
                // A non-JSON text block carries no login; keep looking.
            }
        }
    }
    return null;
}

function loginOf(value: unknown): string | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const login = (value as { login?: unknown }).login;
    return typeof login === 'string' && login.trim() ? login.trim() : null;
}
