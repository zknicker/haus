import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { classifyRuntimeFailure } from '../runtime-failure.ts';
import {
    HarnessTurnFailedError,
    type HarnessTurnInput,
    runHarnessTurn,
    setHarnessAgentFactoryForTesting,
    setHarnessBootstrapRefreshForTesting,
} from './executor.ts';

// The exact error Codex settled Blippy's turn with after ~28s of silent retries.
const codexAuthError =
    'unexpected status 401 Unauthorized: Incorrect API key provided: sk-svcac***fvMA. You can find your API key at https://platform.openai.com/account/api-keys., url: https://chatgpt.com/backend-api/codex/responses';

// Shapes codex-acp 1.12 sends once Haus advertises typed session failures, captured from a
// live codex-acp run against a rejected API key.
const terminalAuthFailure = {
    _meta: {
        jetbrains: {
            air: {
                sessionFailure: {
                    actions: ['retry'],
                    category: 'service',
                    id: 'turn_1:error',
                    revision: 10,
                    severity: 'error',
                    title: codexAuthError,
                },
                version: 1,
            },
        },
    },
    stopReason: 'end_turn',
};

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let agentRoot: string;
let attempts: number;
let destroyedSessions: number;
let parts: (signal: AbortSignal | undefined) => AsyncGenerator<unknown>;
let restore: () => void;
let restoreBootstrapRefresh: () => void;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-session-failure-'));
    attempts = 0;
    destroyedSessions = 0;
    restore = setHarnessAgentFactoryForTesting(() => fakeAgent());
    restoreBootstrapRefresh = setHarnessBootstrapRefreshForTesting(async () => undefined);
});

afterEach(async () => {
    restore();
    restoreBootstrapRefresh();
    await rm(agentRoot, { force: true, recursive: true });
});

test('a rejected credential ends the turn on its first retry instead of five', async () => {
    parts = (signal) => retryingProvider(signal, 'access', codexAuthError);
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(attempts).toBe(1);
    // Destroying the runtime session stops Codex from retrying behind the failed turn.
    expect(destroyedSessions).toBe(1);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).toBe(
        'authentication'
    );
});

test.each([
    ['limit', '429 Too Many Requests'],
    ['service', 'unexpected status 503 Service Unavailable'],
])('a transient %s retry keeps the turn running through every retry', async (category, title) => {
    parts = (signal) => retryingProvider(signal, category, title);
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(attempts).toBe(5);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).not.toBe(
        'authentication'
    );
});

test('a terminal provider failure reported beside end_turn settles the turn as failed', async () => {
    parts = async function* () {
        yield { rawValue: terminalAuthFailure, type: 'raw' };
        yield { totalUsage: undefined, type: 'finish' };
    };
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).toBe(
        'authentication'
    );
});

// Juniper, 2026-09-30: a turn whose bridge died left that bridge's port stored, and every resume
// retried the dead port until the startup deadline.
test('a failed turn forgets its destroyed Claude bridge but keeps the conversation', async () => {
    const claudeState = {
        data: {
            bridge: { lastSeenEventId: 7202, port: 55_172, sandboxId: 'agt-5', token: 'dead' },
            claudeSessionId: 'claude_session_1',
        },
        harnessId: 'claude-code',
        type: 'resume-session',
    };
    await storeSession('claude-code', 'claude-opus-4-8', claudeState);
    parts = failingStream;

    await expect(
        runHarnessTurn(turnInput({ modelId: 'claude-opus-4-8', runtimeId: 'claude-code' }))
    ).rejects.toBeInstanceOf(HarnessTurnFailedError);

    expect(destroyedSessions).toBe(1);
    expect(await storedResumeState()).toEqual({
        ...claudeState,
        data: { claudeSessionId: 'claude_session_1' },
    });
});

test('a failed turn keeps ACP bridge coordinates for process-loss recovery', async () => {
    const acpState = {
        data: { acpSessionId: 'acp_1', bridge: { lastSeenEventId: 3, port: 1, token: 't' } },
        harnessId: 'codex',
        type: 'resume-session',
    };
    await storeSession('codex', 'gpt-5.6-sol', acpState);
    parts = failingStream;

    await expect(runHarnessTurn(turnInput())).rejects.toBeInstanceOf(HarnessTurnFailedError);

    expect(await storedResumeState()).toEqual(acpState);
});

async function* failingStream(): AsyncGenerator<unknown> {
    yield { error: new Error('provider failed'), type: 'error' };
}

async function storeSession(runtimeId: string, modelId: string, resumeState: unknown) {
    await mkdir(agentRoot, { recursive: true });
    await writeFile(
        join(agentRoot, 'session.json'),
        JSON.stringify({
            bootstrapFingerprint: null,
            effectiveModel: { modelId, runtimeId },
            effectiveReasoningEffort: 'medium',
            generation: 1,
            hausAgentAppliedAt: null,
            hausAgentStatus: 'current',
            hausAgentVersion: null,
            instructionFingerprint: null,
            resumeState,
            runtimeSessionId: 'engine_session_1',
        })
    );
}

async function storedResumeState(): Promise<unknown> {
    return JSON.parse(await readFile(join(agentRoot, 'session.json'), 'utf8')).resumeState;
}

/** codex-acp's five reconnect warnings, then the terminal failure beside `end_turn`. */
async function* retryingProvider(
    signal: AbortSignal | undefined,
    category: string,
    finalTitle: string
): AsyncGenerator<unknown> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        if (signal?.aborted) {
            yield { type: 'abort' };
            return;
        }
        attempts = attempt;
        yield {
            rawValue: sessionFailureUpdate({
                actions: [],
                category,
                severity: 'warning',
                title: `Reconnecting... ${attempt}/5`,
            }),
            type: 'raw',
        };
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    yield {
        rawValue: {
            ...terminalAuthFailure,
            _meta: {
                jetbrains: {
                    air: {
                        sessionFailure: {
                            ...terminalAuthFailure._meta.jetbrains.air.sessionFailure,
                            title: finalTitle,
                        },
                        version: 1,
                    },
                },
            },
        },
        type: 'raw',
    };
    yield { totalUsage: undefined, type: 'finish' };
}

function sessionFailureUpdate(failure: Record<string, unknown>) {
    return {
        _meta: { jetbrains: { air: { sessionFailure: { id: 'f', revision: 1, ...failure } } } },
        sessionUpdate: 'session_info_update',
    };
}

function fakeAgent(): Pick<HarnessAgent, 'createSession' | 'stream'> {
    return {
        createSession: (async () => ({
            destroy: async () => {
                destroyedSessions += 1;
            },
            detach: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
            isResume: false,
            sessionId: 'engine_session_1',
            stop: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
        })) as unknown as HarnessAgent['createSession'],
        stream: (async (options: { abortSignal?: AbortSignal }) => ({
            consumeStream: async () => undefined,
            fullStream: parts(options.abortSignal),
        })) as unknown as HarnessAgent['stream'],
    };
}

function turnInput(overrides: Partial<HarnessTurnInput> = {}): HarnessTurnInput {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_test',
        agentName: 'Blippy',
        agentRoot,
        dataRoot: agentRoot,
        drainItemIds: [],
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtime,
        runtimeId: 'codex',
        serverId: 'srv_session_failure_test',
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        tools: {},
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(agentRoot, 'workspace'),
        ...overrides,
    };
}
