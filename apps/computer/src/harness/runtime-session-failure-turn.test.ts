import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import { classifyRuntimeFailure } from '../runtime-failure.ts';
import {
    HarnessTurnFailedError,
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';

// The exact error Codex settled Blippy's turn with after ~28s of silent retries.
const codexAuthError =
    'unexpected status 401 Unauthorized: Incorrect API key provided: sk-svcac***fvMA. You can find your API key at https://platform.openai.com/account/api-keys., url: https://chatgpt.com/backend-api/codex/responses';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let agentRoot: string;
let attempts: number;
let events: () => AsyncGenerator<TurnEvent>;
let restore: () => void;

const driver = fakeRuntimeDriver<HarnessTurnInput>({ turn: () => events() });

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-session-failure-'));
    attempts = 0;
    driver.record.counts.destroy = 0;
    restore = setRuntimeDriverFactoryForTesting(driver.factory);
});

afterEach(async () => {
    restore();
    await rm(agentRoot, { force: true, recursive: true });
});

test('a rejected credential ends the turn on its first retry instead of five', async () => {
    events = () => retryingProvider('access', codexAuthError);
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(attempts).toBe(1);
    // Destroying the runtime session stops Codex from retrying behind the failed turn.
    expect(driver.record.counts.destroy).toBe(1);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).toBe(
        'authentication'
    );
});

test.each([
    ['limit', '429 Too Many Requests'],
    ['service', 'unexpected status 503 Service Unavailable'],
])('a transient %s retry keeps the turn running through every retry', async (category, title) => {
    events = () => retryingProvider(category, title);
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(attempts).toBe(5);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).not.toBe(
        'authentication'
    );
});

test('a terminal provider failure reported beside a finished turn settles it as failed', async () => {
    events = async function* () {
        yield terminalFailure(codexAuthError);
        yield* finishedTurn();
    };
    const failure = await runHarnessTurn(turnInput()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HarnessTurnFailedError);
    expect(classifyRuntimeFailure((failure as HarnessTurnFailedError).cause)).toBe(
        'authentication'
    );
});

test('a failed turn destroys its session but keeps the stored conversation for retry', async () => {
    const conversation: RuntimeResumeState = {
        claudeSessionId: 'claude_session_1',
        runtime: 'claude-code',
        version: 1,
    };
    await storeSession('claude-code', 'claude-opus-4-8', conversation);
    events = async function* () {
        yield { error: new Error('provider failed'), type: 'error' };
    };

    await expect(
        runHarnessTurn(turnInput({ modelId: 'claude-opus-4-8', runtimeId: 'claude-code' }))
    ).rejects.toBeInstanceOf(HarnessTurnFailedError);

    expect(driver.record.counts.destroy).toBe(1);
    expect(await storedResumeState()).toEqual(conversation);
});

async function storeSession(runtimeId: string, modelId: string, resumeState: unknown) {
    await mkdir(agentRoot, { recursive: true });
    await writeFile(
        join(agentRoot, 'session.json'),
        JSON.stringify({
            bootstrapFingerprint: 'fake-bootstrap',
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

/** Codex's five reconnect warnings, then the terminal failure beside a finished turn. */
async function* retryingProvider(category: string, finalTitle: string): AsyncGenerator<TurnEvent> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        attempts = attempt;
        yield {
            category,
            severity: 'warning',
            title: `Reconnecting... ${attempt}/5`,
            type: 'session-failure',
        };
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    yield terminalFailure(finalTitle);
    yield* finishedTurn();
}

function terminalFailure(title: string): TurnEvent {
    return { category: 'service', severity: 'error', title, type: 'session-failure' };
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
        tools: [],
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(agentRoot, 'workspace'),
        ...overrides,
    };
}
