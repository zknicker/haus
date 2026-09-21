import type { Agent as CursorAgentApi, Cursor as CursorApi, Run, RunStatus } from '@cursor/sdk';
import { streamCursorRun } from './sdk-stream.ts';
import {
    type CursorAuth,
    type CursorLaunchReading,
    type CursorRunAddress,
    type CursorRunEvent,
    type CursorRunReading,
    type CursorRunStatus,
    type CursorSendInput,
    type CursorStartInput,
    type CursorTransport,
    CursorTransportUnavailableError,
} from './transport.ts';

interface CursorSdk {
    Agent: typeof CursorAgentApi;
    Cursor: Pick<typeof CursorApi, 'auth'>;
}

/**
 * The live `@cursor/sdk` transport. The SDK is imported lazily so a Computer
 * that cannot load it — an unsupported platform, a missing native optional
 * dependency — still starts, reports `provider-unavailable`, and runs every
 * other capability.
 *
 * The user API key is read only by the SDK. Nothing here logs it, returns it,
 * or hands it to a caller: `CURSOR_API_KEY` and `~/.cursor/sdk/auth.json` stay
 * the SDK's own business.
 */
export function createCursorSdkTransport(
    loadSdk: () => Promise<CursorSdk> = () => import('@cursor/sdk')
): CursorTransport {
    let sdk: Promise<CursorSdk> | null = null;
    const load = async (): Promise<CursorSdk> => {
        sdk ??= loadSdk();
        try {
            return await sdk;
        } catch (cause) {
            sdk = null;
            throw new CursorTransportUnavailableError(cause);
        }
    };

    return {
        async authStatus(): Promise<CursorAuth> {
            const { Cursor } = await load();
            if (process.env.CURSOR_API_KEY) {
                // An explicitly configured key outranks the credential store
                // and carries no expiry of its own.
                return { connected: true, email: null, expiresAt: null };
            }
            const status = await Cursor.auth.status();
            if (status.status === 'logged-out') {
                return { connected: false, reason: 'not-connected' };
            }
            if (status.apiKeyExpiresAtMs !== undefined && status.apiKeyExpiresAtMs <= Date.now()) {
                return { connected: false, reason: 'expired' };
            }
            return {
                connected: true,
                email: status.email ?? null,
                expiresAt:
                    status.apiKeyExpiresAtMs === undefined
                        ? null
                        : new Date(status.apiKeyExpiresAtMs).toISOString(),
            };
        },
        async cancelRun(address: CursorRunAddress, signal?: AbortSignal): Promise<void> {
            signal?.throwIfAborted();
            const { Agent } = await load();
            signal?.throwIfAborted();
            await Agent.cancelRun(address.runId, { agentId: address.agentId, runtime: 'cloud' });
            signal?.throwIfAborted();
        },
        async login(options: {
            onLoginUrl?: (url: string) => void;
            signal?: AbortSignal;
        }): Promise<CursorAuth> {
            const { Cursor } = await load();
            options.signal?.throwIfAborted();
            const result = await Cursor.auth.login({ ...options, openBrowser: false });
            return {
                connected: true,
                email: result.email ?? null,
                expiresAt: new Date(result.apiKeyExpiresAtMs).toISOString(),
            };
        },
        async logout(): Promise<void> {
            const { Cursor } = await load();
            await Cursor.auth.logout();
        },
        async readRun(address: CursorRunAddress, signal?: AbortSignal): Promise<CursorRunReading> {
            signal?.throwIfAborted();
            const { Agent } = await load();
            signal?.throwIfAborted();
            const run = await Agent.getRun(address.runId, {
                agentId: address.agentId,
                runtime: 'cloud',
            });
            signal?.throwIfAborted();
            const reading = await readingOf(Agent, address.agentId, run);
            signal?.throwIfAborted();
            return reading;
        },
        async send(input: CursorSendInput): Promise<CursorLaunchReading> {
            const { Agent } = await load();
            const agent = await Agent.resume(input.agentId, { cloud: {} });
            return sendWithHandle(agent, input);
        },
        async start(input: CursorStartInput): Promise<CursorLaunchReading> {
            const { Agent } = await load();
            // `Agent.create` returns a handle before Cursor persists anything;
            // this first `send` is what creates the hosted Run.
            const agent = await Agent.create({
                cloud: {
                    autoCreatePR: true,
                    repos: [
                        {
                            url: `https://github.com/${input.repository}`,
                            ...(input.ref ? { startingRef: input.ref } : {}),
                        },
                    ],
                },
                idempotencyKey: input.idempotencyKey,
                name: input.title,
            });
            return sendWithHandle(agent, input);
        },
        async streamRun(
            address: CursorRunAddress,
            onEvent: (event: CursorRunEvent) => Promise<void>,
            signal: AbortSignal
        ): Promise<void> {
            signal.throwIfAborted();
            const { Agent } = await load();
            signal.throwIfAborted();
            const run = await Agent.getRun(address.runId, {
                agentId: address.agentId,
                runtime: 'cloud',
            });
            await streamCursorRun(run, onEvent, signal);
        },
    };
}

async function sendWithHandle(
    agent: Awaited<ReturnType<typeof CursorAgentApi.resume>>,
    input: Pick<CursorSendInput, 'instructions' | 'idempotencyKey'>
): Promise<CursorLaunchReading> {
    try {
        const run = await agent.send(input.instructions, {
            idempotencyKey: input.idempotencyKey,
        });
        return {
            agentId: agent.agentId,
            reading: {
                branches: [],
                errorCode: run.error?.code ?? null,
                errorMessage: run.error?.message ?? null,
                rawStatus: rawStatusOf(run.status, run.error),
                result: run.result ?? null,
                runId: run.id,
                usage: null,
            },
        };
    } finally {
        await agent[Symbol.asyncDispose]();
    }
}

async function readingOf(
    agentApi: typeof CursorAgentApi,
    agentId: string,
    run: Run
): Promise<CursorRunReading> {
    return {
        branches: (run.git?.branches ?? []).map((branch) => ({
            branch: branch.branch ?? null,
            prUrl: branch.prUrl ?? null,
            repoUrl: branch.repoUrl,
        })),
        errorCode: run.error?.code ?? null,
        errorMessage: run.error?.message ?? null,
        rawStatus: rawStatusOf(run.status, run.error),
        result: run.result ?? null,
        runId: run.id,
        usage: await usageOf(agentApi, agentId, run),
    };
}

/**
 * The SDK collapses `EXPIRED` into `error`, so an expired Run is recoverable
 * from a read only through the error Cursor reports with it. A live stream's
 * own `status` message is authoritative when one arrives.
 */
function rawStatusOf(
    status: RunStatus,
    error: { code?: string; message: string } | undefined
): CursorRunStatus {
    switch (status) {
        case 'running':
            return 'RUNNING';
        case 'finished':
            return 'FINISHED';
        case 'cancelled':
            return 'CANCELLED';
        case 'error':
            return looksExpired(error) ? 'EXPIRED' : 'ERROR';
    }
}

function looksExpired(error: { code?: string; message: string } | undefined): boolean {
    return /expired/iu.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

/** Per-Run tokens and cost, when Cursor has reported them for this Run. */
async function usageOf(
    agentApi: typeof CursorAgentApi,
    agentId: string,
    run: Run
): Promise<CursorRunReading['usage']> {
    try {
        const usage = await agentApi.getUsage(agentId, { runId: run.id });
        const entry = usage.runs.find((candidate) => candidate.runId === run.id);
        const tokens = entry?.usage ?? run.usage;
        if (!tokens) {
            return null;
        }
        return {
            chargedCents: entry?.cost?.chargedCents ?? null,
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
        };
    } catch {
        // Usage is reported separately and can lag a terminal Run. Missing
        // usage is a missing field, never a failed observation.
        return run.usage
            ? {
                  chargedCents: null,
                  inputTokens: run.usage.inputTokens,
                  outputTokens: run.usage.outputTokens,
              }
            : null;
    }
}
