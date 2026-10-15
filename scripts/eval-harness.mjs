// Shared Server behavioral-eval plumbing: authenticates as the configured development
// Clerk user, then drives real Server -> Computer -> model turns through the public tRPC contract.
import { createRequire } from 'node:module';
import { appProtocolHeaders, appProtocolVersion } from '../packages/haus-api/src/app-protocol.ts';
import { resolveDevPorts } from './dev-ports.mjs';
import { syncEvalHumanIdentity } from './eval-human-identity.mjs';
import { loadHeadlessClerk } from './headless-clerk.mjs';
export class InfraError extends Error {}
const devClerkAuthByServer = new Map();

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
    const auth = await createDevClerkAuth(serverUrl);

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
        // Clerk's headless client keeps token-refresh timers alive after its
        // native session ends. This CLI has finished once the report is written.
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

async function createDevClerkAuth(serverUrl) {
    const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    assert(
        publishableKey,
        'Hosted eval auth needs the dev Clerk publishable key used by bun run dev'
    );
    const cacheKey = `${serverUrl}\0${publishableKey}`;
    let entry = devClerkAuthByServer.get(cacheKey);
    if (entry?.closeTimer) {
        clearTimeout(entry.closeTimer);
        entry.closeTimer = undefined;
    }

    if (!entry) {
        entry = {
            auth: createDevClerkAuthSession(serverUrl, publishableKey),
            closeTimer: undefined,
        };
        devClerkAuthByServer.set(cacheKey, entry);
    }

    try {
        const auth = await entry.auth;
        return {
            getToken: auth.getToken,
            close: async () => {
                if (entry.closeTimer) {
                    clearTimeout(entry.closeTimer);
                }
                entry.closeTimer = setTimeout(async () => {
                    if (devClerkAuthByServer.get(cacheKey) !== entry) {
                        return;
                    }
                    devClerkAuthByServer.delete(cacheKey);
                    await auth.close();
                }, 5000);
            },
        };
    } catch (error) {
        if (devClerkAuthByServer.get(cacheKey) === entry) {
            devClerkAuthByServer.delete(cacheKey);
        }
        throw error;
    }
}

async function createDevClerkAuthSession(serverUrl, publishableKey) {
    let ticketResponse;
    try {
        ticketResponse = await fetch(`${serverUrl}/trpc/dev.createClerkSignInToken`, {
            body: '{}',
            headers: { ...protocolHeaders(), 'content-type': 'application/json' },
            method: 'POST',
        });
    } catch (error) {
        throw new InfraError(
            `Dev Clerk sign-in request to ${serverUrl} failed: ${formatError(error)}`,
            { cause: error }
        );
    }
    const ticketPayload = await ticketResponse.json().catch(() => null);
    if (!ticketResponse.ok) {
        throw new Error(
            `Dev Clerk sign-in failed (${ticketResponse.status}): ${formatPayload(ticketPayload)}`
        );
    }
    const ticket = ticketPayload?.result?.data?.ticket;
    assert(ticket, 'Dev Clerk sign-in did not return a ticket');

    const websiteRequire = createRequire(new URL('../apps/website/package.json', import.meta.url));
    const { Clerk } = loadHeadlessClerk(websiteRequire);
    const clerk = new Clerk(publishableKey);
    let nativeAuthorization = '';

    clerk.__unstable__onBeforeRequest(async (requestInit) => {
        requestInit.credentials = 'omit';
        requestInit.url?.searchParams.append('_is_native', '1');
        requestInit.headers.set('authorization', nativeAuthorization);
    });
    clerk.__unstable__onAfterResponse(async (_requestInit, response) => {
        nativeAuthorization = response?.headers.get('authorization') ?? nativeAuthorization;
    });

    try {
        await clerk.load({ standardBrowser: false });
    } catch (error) {
        throw new InfraError(`Clerk client failed to load: ${formatError(error)}`, {
            cause: error,
        });
    }
    let attempt;
    try {
        attempt = await clerk.client.signIn.create({ strategy: 'ticket', ticket });
    } catch (error) {
        throw new InfraError(`Clerk ticket exchange failed: ${formatError(error)}`, {
            cause: error,
        });
    }
    assert(attempt.status === 'complete', `Dev Clerk sign-in stopped at ${attempt.status}`);
    await clerk.setActive({ session: attempt.createdSessionId });

    return {
        close: async () => {
            await Promise.race([clerk.session?.end(), sleep(5000)]);
        },
        getToken: async () => {
            const token = await clerk.session?.getToken();
            if (!token) {
                throw new InfraError('Clerk did not provide a session token');
            }
            return token;
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

function formatError(error) {
    if (!(error instanceof Error)) {
        return String(error);
    }
    const details = JSON.stringify({
        code: error.code,
        errors: error.errors,
        retryAfter: error.retryAfter,
        status: error.status,
    });
    const causes =
        error.cause instanceof AggregateError
            ? error.cause.errors.map((cause) => String(cause)).join('; ')
            : String(error.cause ?? '');
    return [error.message, causes, details === '{}' ? '' : details].filter(Boolean).join(' — ');
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
