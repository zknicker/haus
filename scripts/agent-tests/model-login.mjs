export const environmentLogins = Object.freeze({
    claude: { env: 'HAUS_RUNNER_TEST_CLAUDE_SETUP_TOKEN', kind: 'setup-token' },
    gemini: { env: 'HAUS_GEMINI_API_KEY', kind: 'api-key' },
});

export const evalLoginLabel = 'Agent tests';

export async function ensureModelLogin(harness, provider, env = process.env) {
    const { connections } = await harness.trpc('modelConnections.list', {
        serverId: harness.serverId,
    });
    if (connections.some((connection) => usable(connection, provider))) {
        return 'connected';
    }
    const login = environmentLogins[provider];
    const secret = login ? env[login.env] : undefined;
    if (!(login && secret)) {
        throw new Error(missingLoginMessage(provider));
    }
    const credential =
        login.kind === 'api-key'
            ? { key: secret, kind: 'api-key' }
            : { kind: login.kind, token: secret };
    await harness.trpc('modelConnections.add', {
        credential,
        label: evalLoginLabel,
        provider,
        serverId: harness.serverId,
    });
    return 'added';
}

export function missingLoginMessage(provider) {
    const login = environmentLogins[provider];
    return login
        ? `The eval Server has no ${provider} model connection and ${login.env} is not set; run through varlock or connect one in Settings → Models.`
        : `The eval Server has no ${provider} model connection, and ${provider} signs in with OAuth; connect one on the stack in Settings → Models.`;
}

export function providerForModel(modelId) {
    if (modelId.includes('/')) {
        return 'openrouter';
    }
    for (const [prefix, provider] of [
        ['claude-', 'claude'],
        ['grok-', 'xai'],
        ['gemini-', 'gemini'],
    ]) {
        if (modelId.startsWith(prefix)) {
            return provider;
        }
    }
    return 'chatgpt';
}

function usable(connection, provider) {
    return connection.provider === provider && connection.enabled && connection.status === 'ready';
}
