import { type McpIcon, type McpPreset, mcpIconSchema, mcpPresetIcons } from '@haus/api';
import type { McpIconResolver } from './icons.ts';

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
            connectionUrl: connection.url,
            preferPageIcon: connection.preset !== null,
            serverInfoIcons: serverInfoIcons ?? [],
            timeoutMs: 4000,
        })) ?? retained
    );
}
