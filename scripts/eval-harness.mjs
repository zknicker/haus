// Shared Server behavioral-eval plumbing: uses the loopback-only development
// session, then drives real Server -> Computer -> model turns through tRPC.
import { appProtocolHeaders, appProtocolVersion } from '../packages/haus-api/src/app-protocol.ts';
import { resolveDevPorts } from './dev-ports.mjs';
import { syncEvalHumanIdentity } from './eval-human-identity.mjs';
export class InfraError extends Error {}

export async function createEvalHarness({ evalName, repositoryRoot = process.cwd() }) {
    const serverUrl = resolveServerUrl(repositoryRoot);
    const onlyFilter = resolveFlag('--only');
    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/gu, '')
        .slice(0, 14);
    const results = [];
    const trackedAgentIds = new Set();
    const profileRestores = new Map();
    const configRestores = new Map();
    const auth = await createDevAuthSession(serverUrl);

    async function trpc(path, input = {}) {
        const token = await auth.getToken();
        const response = await fetch(`${serverUrl}/trpc/${path}`, {
            body: JSON.stringify(input),
            headers: {
                ...protocolHeaders(),
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`${path} failed (${response.status}): ${formatPayload(payload)}`);
        }
        return payload?.result?.data ?? null;
    }

    let servers = await trpc('server.list');
    if (servers.length === 0) {
        await trpc('server.developmentBootstrap');
        servers = await trpc('server.list');
    }
    const server = selectServer(servers, resolveFlag('--server-id'));
    const serverId = server.id;
    await syncEvalHumanIdentity(trpc, serverId);

    async function scenario(name, run, { retryOn = 'infra' } = {}) {
        if (onlyFilter && !name.includes(onlyFilter)) {
            return;
        }
        process.stdout.write(`\n▶ ${name}\n`);
        const startedAt = Date.now();
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                await run();
                results.push({ name, ok: true, seconds: seconds(startedAt) });
                process.stdout.write(`  ✓ pass (${seconds(startedAt)}s)\n`);
                return;
            } catch (error) {
                const retryable = retryOn === 'any' || error instanceof InfraError;
                if (retryable && attempt === 1) {
                    process.stdout.write(`  ↻ retrying: ${String(error).slice(0, 160)}\n`);
                    continue;
                }
                results.push({
                    error: String(error),
                    name,
                    ok: false,
                    seconds: seconds(startedAt),
                });
                process.stdout.write(`  ✗ FAIL: ${String(error).slice(0, 300)}\n`);
                return;
            }
        }
    }

    function report() {
        const failed = results.filter((result) => !result.ok);
        process.stdout.write(
            `\n${results.length - failed.length}/${results.length} scenarios passed on ${server.displayName}\n`
        );
        if (failed.length > 0) {
            process.exitCode = 1;
        }
        setTimeout(() => process.exit(process.exitCode ?? 0), 0);
    }

    async function requireAgents(count) {
        const deadline = Date.now() + 60_000;
        let available = [];
        do {
            const agents = await trpc('agent.list', { serverId });
            available = agents.filter(
                (agent) =>
                    agent.status === 'applied' &&
                    agent.availability !== 'offline' &&
                    agent.availability !== 'stopped'
            );
            if (available.length >= count) {
                break;
            }
            await sleep(1000);
        } while (Date.now() < deadline);
        assert(
            available.length >= count,
            `${evalName} needs ${count} applied online Agents; found ${available.length}`
        );
        for (const agent of available.slice(0, count)) {
            trackedAgentIds.add(agent.id);
        }
        return available.slice(0, count).map((agent) => ({
            ...agent,
            name: agent.displayName,
        }));
    }

    async function requireChannel(name) {
        const chats = await trpc('chat.list', { serverId });
        const channel = chats.find((chat) => chat.kind === 'channel' && chat.name === name);
        assert(channel, `${evalName} needs the seeded #${name} channel`);
        return channel.id;
    }

    function requireDm(agent) {
        assert(agent.dmChatId, `${agent.name} has no Owner DM`);
        return agent.dmChatId;
    }

    async function withTempDescription(agent, description) {
        if (!profileRestores.has(agent.id)) {
            profileRestores.set(agent.id, {
                description: agent.description,
                displayName: agent.displayName,
            });
        }
        await trpc('agent.updateProfile', {
            agentId: agent.id,
            description,
            displayName: agent.displayName,
            serverId,
        });
    }

    async function configureAgent(agent, runtimeId, modelId) {
        if (!configRestores.has(agent.id)) {
            configRestores.set(agent.id, {
                modelId: agent.desiredModelId,
                runtimeId: agent.desiredRuntimeId,
            });
        }
        return await trpc('agent.configure', {
            agentId: agent.id,
            modelId,
            runtimeId,
            serverId,
        });
    }

    async function send(chatId, content) {
        return await trpc('chat.send', {
            attachmentIds: [],
            chatId,
            content,
            nonce: `${evalName}_${stamp}_${crypto.randomUUID()}`,
            serverId,
        });
    }

    async function readPage(chatId) {
        const [page, states] = await Promise.all([
            trpc('chat.messages', { chatId, limit: 100, serverId }),
            Promise.all(
                [...trackedAgentIds].map((agentId) =>
                    trpc('agent.deliveryState', { agentId, serverId })
                )
            ),
        ]);
        return {
            activeTurnAgentIds: states
                .filter((state) => state.running)
                .map((state) => state.agentId),
            messages: page.messages,
            threads: page.threads,
        };
    }

    async function readMessages(chatId) {
        return (await readPage(chatId)).messages;
    }

    async function readHead(chatId) {
        const messages = await readMessages(chatId);
        return messages.at(-1)?.sequence ?? 0;
    }

    function authoredBy(messages, agentId, afterSequence = 0) {
        return messages
            .filter(
                (message) =>
                    message.sequence > afterSequence &&
                    message.author.kind === 'agent' &&
                    message.author.agentId === agentId
            )
            .map((message) => message.content);
    }

    async function pollMessages(chatId, predicate, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const page = await readPage(chatId);
            if (predicate(page.messages)) {
                return page.messages;
            }
            await sleep(3000);
        }
        throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting on ${chatId}`);
    }

    async function waitForTurnActive(agentId, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const state = await trpc('agent.deliveryState', { agentId, serverId });
            if (state.running) {
                return;
            }
            await sleep(1000);
        }
        throw new Error(`Agent ${agentId} never started a turn`);
    }

    async function waitForAgentQuiet(agentId, quietMs, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        let quietSince = null;
        while (Date.now() < deadline) {
            const state = await trpc('agent.deliveryState', { agentId, serverId });
            if (state.running || state.pending > 0) {
                quietSince = null;
            } else if (quietSince === null) {
                quietSince = Date.now();
            } else if (Date.now() - quietSince >= quietMs) {
                return;
            }
            await sleep(2000);
        }
        throw new Error(`Agent ${agentId} never went quiet`);
    }

    async function cleanup() {
        for (const [agentId, profile] of profileRestores) {
            await boundedCleanup(
                trpc('agent.updateProfile', { agentId, serverId, ...profile }),
                `profile restore for ${agentId}`
            );
        }
        for (const [agentId, config] of configRestores) {
            await boundedCleanup(
                trpc('agent.configure', { agentId, serverId, ...config }),
                `model restore for ${agentId}`
            );
        }
        await auth.close();
    }

    async function boundedCleanup(operation, label) {
        await Promise.race([
            operation,
            sleep(30_000).then(() => {
                throw new Error(`${label} timed out after 30s`);
            }),
        ]).catch((error) => process.stdout.write(`cleanup: ${label} failed: ${error}\n`));
    }

    return {
        authoredBy,
        cleanup,
        configureAgent,
        memberToken: () => auth.getToken(),
        pollMessages,
        readHead,
        readMessages,
        report,
        requireAgents,
        requireChannel,
        requireDm,
        scenario,
        send,
        serverId,
        serverSlug: server.slug,
        serverUrl,
        stamp,
        trpc,
        waitForAgentQuiet,
        waitForTurnActive,
        withTempDescription,
    };
}

export async function createDevAuthSession(serverUrl, fetcher = fetch) {
    const origin = new URL(serverUrl);
    assert(
        ['localhost', '127.0.0.1', '::1'].includes(origin.hostname),
        'Development auth requires a loopback Haus Server URL'
    );

    const endpoint = new URL('/auth/dev/session', origin);
    let current = await requestSession(null);
    let refreshing;

    async function requestSession(sessionToken) {
        let response;
        try {
            response = await fetcher(endpoint, {
                body: JSON.stringify({
                    client: 'desktop',
                    ...(sessionToken ? { sessionToken } : {}),
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
        } catch (error) {
            throw new InfraError(`Local Haus auth request failed: ${String(error)}`, {
                cause: error,
            });
        }
        const payload = await response.json().catch(() => null);
        if (!(response.ok && payload?.session?.accessToken && payload?.sessionToken)) {
            throw new Error(
                `Local Haus sign-in failed (${response.status}): ${formatPayload(payload)}`
            );
        }
        return payload;
    }

    return {
        async close() {
            const session = current;
            current = null;
            if (!session) {
                return;
            }
            const response = await fetcher(new URL('/auth/logout', origin), {
                body: JSON.stringify({ client: 'desktop', sessionToken: session.sessionToken }),
                headers: {
                    'content-type': 'application/json',
                    'x-haus-session-request': '1',
                },
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Local Haus sign-out failed (${response.status}).`);
            }
        },
        async getToken() {
            if (!current) {
                throw new Error('Local Haus auth session is closed.');
            }
            if (Date.parse(current.session.expiresAt) - Date.now() <= 15_000) {
                refreshing ??= requestSession(current.sessionToken)
                    .then((session) => {
                        current = session;
                    })
                    .finally(() => {
                        refreshing = undefined;
                    });
                await refreshing;
            }
            return current.session.accessToken;
        },
    };
}

function protocolHeaders() {
    return {
        [appProtocolHeaders.productVersion]: 'dev-eval',
        [appProtocolHeaders.protocolVersion]: String(appProtocolVersion),
    };
}

function resolveServerUrl(repositoryRoot) {
    const explicit = resolveFlag('--server');
    if (explicit) {
        return explicit.replace(/\/$/u, '');
    }
    return `http://localhost:${resolveDevPorts({ repositoryRoot }).hausPort}`;
}

function resolveFlag(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}

export function selectServer(servers, requestedServerId) {
    assert(Array.isArray(servers) && servers.length > 0, 'No Servers are available');
    if (requestedServerId) {
        const server = servers.find((candidate) => candidate.id === requestedServerId);
        assert(server, `No accessible Server has id ${requestedServerId}`);
        return server;
    }
    return servers.find((server) => server.slug === 'dev') ?? servers[0];
}

function formatPayload(payload) {
    return JSON.stringify(payload)?.slice(0, 400) ?? 'no response body';
}

export function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

export function seconds(startedAt) {
    return Math.round((Date.now() - startedAt) / 1000);
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
