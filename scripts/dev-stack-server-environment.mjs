export function createDevServerEnvironment(
    startupEnvironment,
    ports,
    databaseUrl,
    objectStorageEndpoint = null
) {
    return {
        ...startupEnvironment,
        ...(objectStorageEndpoint ? { HAUS_ARTIFACT_R2_ENDPOINT: objectStorageEndpoint } : {}),
        HAUS_APP_ORIGIN:
            startupEnvironment.HAUS_APP_ORIGIN ?? `http://localhost:${ports.websitePort}`,
        HAUS_DATABASE_URL: databaseUrl,
        HAUS_SERVER_PORT: String(ports.hausPort),
    };
}

export function createDesktopDevEnvironment({ devStackEnvironment, ports }) {
    return {
        ...devStackEnvironment,
        HAUS_WEBSITE_PORT: String(ports.websitePort),
    };
}

/** Builds every Server-owned connector the Server's catalog starts (`apps/server/src/haus-server.ts`). */
export async function prepareHostedMcps(spawnBackground, environment) {
    for (const command of [
        'node scripts/package-hosted-mcp.mjs .context/hosted-mcp/skool',
        'node scripts/package-hosted-mcp.mjs linear .context/hosted-mcp/linear',
    ]) {
        if (!(await spawnBackground('haus', command, environment))) {
            throw new Error('Failed to prepare Server-owned hosted MCPs.');
        }
    }
}
