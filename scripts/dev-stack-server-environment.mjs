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

export async function prepareHostedMcps(spawnBackground, environment) {
    if (
        !(await spawnBackground(
            'haus',
            'node scripts/package-hosted-mcp.mjs .context/hosted-mcp/skool',
            environment
        ))
    ) {
        throw new Error('Failed to prepare Server-owned hosted MCPs.');
    }
}
