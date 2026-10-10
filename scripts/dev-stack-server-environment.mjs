import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createDevServerEnvironment(startupEnvironment, ports, databaseUrl) {
    return {
        ...startupEnvironment,
        HAUS_APP_ORIGIN:
            startupEnvironment.HAUS_APP_ORIGIN ?? `http://localhost:${ports.websitePort}`,
        HAUS_DATABASE_URL: databaseUrl,
        HAUS_SERVER_PORT: String(ports.hausPort),
        HAUS_SKOOL_CONTROL_TOKEN: startupEnvironment.HAUS_SKOOL_CONTROL_TOKEN ?? readControlToken(),
        HAUS_SKOOL_MCP_URL:
            startupEnvironment.HAUS_SKOOL_MCP_URL ??
            `http://127.0.0.1:${Number(ports.websitePort) + 1}/mcp`,
    };
}

function readControlToken() {
    try {
        return readFileSync(
            path.join(os.homedir(), '.local/share/haus-hosted-mcp/control-token'),
            'utf8'
        ).trim();
    } catch (error) {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}
