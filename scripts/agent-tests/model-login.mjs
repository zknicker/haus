import { seedChatgptLogin } from './chatgpt-login.mjs';

export const environmentLogins = Object.freeze({
    gemini: { env: 'HAUS_GEMINI_API_KEY' },
});

export const evalLoginLabel = 'Agent tests';

const chatgptRefreshes = new WeakMap();

export async function ensureModelLogin(harness, provider, env = process.env) {
    const { connections } = await harness.trpc('modelConnections.list', {
        serverId: harness.serverId,
    });
    if (provider === 'chatgpt') {
        if (!chatgptRefreshes.has(harness)) {
            chatgptRefreshes.set(harness, refreshChatgptLogin(harness, connections, env));
        }
        return await chatgptRefreshes.get(harness);
    }
    if (connections.some((connection) => usable(connection, provider))) {
        return 'connected';
    }
    const login = environmentLogins[provider];
    const key = login ? env[login.env] : undefined;
    if (!(login && key)) {
        throw new Error(missingLoginMessage(provider));
    }
    const credential = { key, kind: 'api-key' };
    const own = connections.find(
        (connection) => connection.provider === provider && connection.label === evalLoginLabel
    );
    if (!own) {
        await harness.trpc('modelConnections.add', {
            credential,
            label: evalLoginLabel,
            provider,
            serverId: harness.serverId,
        });
        return 'added';
    }
    const target = { connectionId: own.id, serverId: harness.serverId };
    await harness.trpc('modelConnections.replaceCredential', { ...target, credential });
    if (!own.enabled) {
        await harness.trpc('modelConnections.setEnabled', { ...target, enabled: true });
    }
    return 'repaired';
}

export function missingLoginMessage(provider) {
    const login = environmentLogins[provider];
    return login
        ? `The eval Server has no ${provider} model connection and ${login.env} is not set; run through varlock or connect one in Settings → Models.`
        : `The eval Server has no ${provider} model connection, and none can be added from the environment; connect one on the stack in Settings → Models.`;
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

async function refreshChatgptLogin(harness, connections, env) {
    const others = connections.filter(
        (connection) => connection.provider === 'chatgpt' && connection.label !== evalLoginLabel
    );
    if (others.some((connection) => usable(connection, 'chatgpt'))) {
        return 'connected';
    }
    const own = connections.find(
        (connection) => connection.provider === 'chatgpt' && connection.label === evalLoginLabel
    );
    if (own) {
        await harness.trpc('modelConnections.remove', {
            connectionId: own.id,
            serverId: harness.serverId,
        });
    }
    await seedChatgptLogin(harness, { env, label: evalLoginLabel });
    return own ? 'repaired' : 'added';
}

function usable(connection, provider) {
    return connection.provider === provider && connection.enabled && connection.status === 'ready';
}
