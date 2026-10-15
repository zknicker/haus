import { join } from 'node:path';
import type { McpPreset } from '@haus/api';

export const skoolHostedUrl = 'https://hosted-mcp.haus.invalid/skool/mcp';
export const linearHostedUrl = 'https://hosted-mcp.haus.invalid/linear/mcp';

/**
 * The only way a connection reaches a private connector socket: its logical
 * URL selects a connector here, and only a connection carrying that
 * connector's preset may use it. User-entered URLs never select a process.
 */
const hostedConnectors: ReadonlyMap<string, { id: string; preset: McpPreset }> = new Map([
    [skoolHostedUrl, { id: 'skool', preset: 'skool' }],
    [linearHostedUrl, { id: 'linear', preset: 'linear' }],
]);

/** The connector id serving a connection, or undefined for an ordinary remote MCP. */
export function hostedConnectorId(connection: {
    preset: McpPreset | null;
    url: string;
}): string | undefined {
    const connector = hostedConnectors.get(connection.url);
    return connector && connector.preset === connection.preset ? connector.id : undefined;
}

/** The one logical URL a connector answers on. */
export function hostedConnectorUrl(id: string): string | undefined {
    for (const [url, connector] of hostedConnectors) {
        if (connector.id === id) {
            return url;
        }
    }
    return undefined;
}

export interface HostedMcpDefinition {
    command: readonly [string, ...string[]];
    cwd: string;
    environment: NodeJS.ProcessEnv;
    id: string;
}

export function skoolHostedDefinition(packageRoot: string): HostedMcpDefinition {
    const pythonRoot = join(packageRoot, 'python');
    return {
        id: 'skool',
        command: [join(pythonRoot, 'bin/python3.12'), '-m', 'hosted.managed'],
        cwd: packageRoot,
        environment: {
            PATH: '/usr/bin:/bin',
            PYTHONHOME: pythonRoot,
            PYTHONPATH: packageRoot,
            PYTHONUNBUFFERED: '1',
            PYTHONDONTWRITEBYTECODE: '1',
        },
    };
}

/** The stateless Linear connector: one compiled Bun binary, no storage, no credentials. */
export function linearHostedDefinition(packageRoot: string): HostedMcpDefinition {
    return {
        id: 'linear',
        command: [join(packageRoot, 'bin/hosted-mcp-linear')],
        cwd: packageRoot,
        environment: { PATH: '/usr/bin:/bin' },
    };
}
