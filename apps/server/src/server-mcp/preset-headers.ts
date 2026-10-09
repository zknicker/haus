import type { McpPreset } from '@haus/api';

/**
 * Request headers a first-party preset always sends, on top of the
 * connection's stored headers. GitHub's hosted MCP serves only its default
 * toolsets unless asked; Actions adds workflow runs, logs, and dispatch.
 */
const presetHeaders: Partial<Record<McpPreset, Readonly<Record<string, string>>>> = {
    github: { 'X-MCP-Toolsets': 'default,actions' },
};

export function mcpRequestHeaders(
    preset: McpPreset | null,
    stored: Readonly<Record<string, string>>
): Record<string, string> {
    return { ...stored, ...(preset ? presetHeaders[preset] : undefined) };
}
