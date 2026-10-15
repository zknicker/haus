import {
    isMcpBuiltInPreset,
    type McpBuiltInPreset,
    type McpIcon,
    type McpPreset,
    mcpIconSchema,
    mcpPresetIcons,
} from '@haus/api';
import type { McpIconResolver } from './icons.ts';

/**
 * A built-in connection's stored URL is its Server-hosted connector, which has
 * no public site, so its icon resolves from the service's own address instead,
 * the same before and after an account is bound.
 */
export const mcpBuiltInPresetBrandUrls: Record<McpBuiltInPreset, string> = {
    linear: 'https://mcp.linear.app/mcp',
};

interface ConnectionBranding {
    icon: unknown;
    preset: McpPreset | null;
    url: string;
}

/** Branding belongs to the service, independently of its signed-in account. */
export function readMcpConnectionIcon(connection: Pick<ConnectionBranding, 'icon' | 'preset'>) {
    const bundled = connection.preset ? mcpPresetIcons[connection.preset] : null;
    if (bundled) {
        return bundled;
    }
    // One invalid stored image must not fail the entire connection list.
    const parsed = mcpIconSchema.safeParse(connection.icon);
    return parsed.success ? parsed.data : null;
}

export async function resolveMcpConnectionIcon(
    resolveIcon: McpIconResolver,
    connection: ConnectionBranding,
    serverInfoIcons?: unknown
): Promise<McpIcon | null> {
    const retained = readMcpConnectionIcon(connection);
    const bundled = connection.preset ? mcpPresetIcons[connection.preset] : null;
    if (bundled || (serverInfoIcons === undefined && retained)) {
        return retained;
    }
    if (serverInfoIcons === undefined && connection.preset === null) {
        return null;
    }
    return (
        (await resolveIcon({
            connectionUrl: isMcpBuiltInPreset(connection.preset)
                ? mcpBuiltInPresetBrandUrls[connection.preset]
                : connection.url,
            preferPageIcon: connection.preset !== null,
            serverInfoIcons: serverInfoIcons ?? [],
            timeoutMs: 4000,
        })) ?? retained
    );
}
