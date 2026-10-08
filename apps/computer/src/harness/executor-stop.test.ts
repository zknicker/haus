import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { readAgentSessionState, writeAgentSessionState } from './session-store.ts';

let root: string;
let runtime: ReturnType<typeof makeDaemonRuntime>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-executor-stop-'));
    runtime = makeDaemonRuntime();
    await mkdir(join(root, 'workspace'), { recursive: true });
});

afterEach(async () => {
    await runtime.dispose();
    await rm(root, { force: true, recursive: true });
});

test('a stopped turn parks an idle session and the next message prompts normally', async () => {
    const events: string[] = [];
    const started = Promise.withResolvers<void>();
    const harness = stopHarness({ events, hangFirstPrompt: true, started });
    const stop = new AbortController();
    const stopped = runHarnessTurn(turnInput(harness, stop.signal));
    await started.promise;
    stop.abort();
    expect((await stopped).aborted).toBe(true);
    const parked = await readAgentSessionState(root);
    expect(parked?.resumeState).not.toHaveProperty('continueFrom');

    const next = await runHarnessTurn(turnInput(harness, new AbortController().signal));
    expect(next.aborted).toBe(false);
    // Bootstrap drift may park and restart the native session first; it never sees a continuation.
    expect(events.slice(0, 3)).toEqual(['prompt', 'cancel', 'detach']);
    expect(events.filter((event) => event === 'prompt')).toHaveLength(2);
    expect(events).not.toContain('suspend');
    expect(events).not.toContain('resume-continuation');
});

test('a session parked mid-turn by an earlier Stop drops the abandoned turn and prompts', async () => {
    const events: string[] = [];
    const harness = stopHarness({
        events,
        hangFirstPrompt: false,
        started: Promise.withResolvers<void>(),
    });
    const state = { data: { conversation: 'same' }, harnessId: 'stop-test' };
    await writeAgentSessionState(root, {
        bootstrapFingerprint: null,
        effectiveModel: { modelId: 'test-model', runtimeId: 'codex' },
        effectiveReasoningEffort: 'medium',
        generation: 1,
        hausAgentAppliedAt: null,
        hausAgentStatus: 'pending',
        hausAgentVersion: null,
        instructionFingerprint: null,
        resumeState: {
            ...state,
            continueFrom: { ...state, specificationVersion: 'harness-v1', type: 'continue-turn' },
            specificationVersion: 'harness-v1',
            type: 'resume-session',
        },
        runtimeSessionId: 'agt_test-1',
    });

    const result = await runHarnessTurn(turnInput(harness, new AbortController().signal));
    expect(result.aborted).toBe(false);
    expect(events).not.toContain('resume-continuation');
    expect(events.slice(-2)).toEqual(['prompt', 'detach']);
    const stored = await readAgentSessionState(root);
    expect(stored?.resumeState).not.toHaveProperty('continueFrom');
});

test('the turn after a Stop tells the Agent Haus interrupted it, once', async () => {
    const events: string[] = [];
    const prompts: string[] = [];
    const started = Promise.withResolvers<void>();
    const harness = stopHarness({ events, hangFirstPrompt: true, prompts, started });
    const stop = new AbortController();
    const stopped = runHarnessTurn(turnInput(harness, stop.signal));
    await started.promise;
    stop.abort();
    await stopped;
    expect((await readAgentSessionState(root))?.interruptedTurn).toBe(true);

    await runHarnessTurn(turnInput(harness, new AbortController().signal));
    await runHarnessTurn(turnInput(harness, new AbortController().signal));

    const interrupted = 'Your previous turn was interrupted by Haus';
    expect(prompts.map((prompt) => prompt.includes(interrupted))).toEqual([false, true, false]);
    expect(prompts[1]).toContain('nobody declined it');
    expect(await readAgentSessionState(root)).not.toHaveProperty('interruptedTurn');
});

/** An ACP-shaped adapter: cancellation settles a beat after abort, and suspend returns a continuation. */
function stopHarness(input: {
    events: string[];
    hangFirstPrompt: boolean;
    prompts?: string[];
    started: ReturnType<typeof Promise.withResolvers<void>>;
}): HarnessV1 {
    const state = {
        data: { conversation: 'same' },
        harnessId: 'stop-test',
        specificationVersion: 'harness-v1',
    } as const;
    let prompts = 0;
    return {
        builtinTools: {},
        harnessId: 'stop-test',
        specificationVersion: 'harness-v1',
        doStart: async (options) => {
            if (options.resumeFrom?.continueFrom || options.continueFrom) {
                input.events.push('resume-continuation');
            } else if (options.resumeFrom) {
                input.events.push('resume');
            }
            return {
                sessionId: options.sessionId,
                isResume: !!options.resumeFrom,
                doCompact: async () => undefined,
                doContinueTurn: async () => {
                    throw new Error('Haus never continues a stopped turn');
                },
                doDestroy: async () => {
                    input.events.push('destroy');
                },
                doDetach: async () => {
                    input.events.push('detach');
                    return { ...state, type: 'resume-session' };
                },
                doStop: async () => {
                    input.events.push('stop');
                    return { ...state, type: 'resume-session' };
                },
                doSuspendTurn: async () => {
                    input.events.push('suspend');
                    return { ...state, type: 'continue-turn' };
                },
                doPromptTurn: async (options) => {
                    input.events.push('prompt');
                    input.prompts?.push(JSON.stringify(options.prompt));
                    prompts += 1;
                    const done = Promise.withResolvers<void>();
                    if (input.hangFirstPrompt && prompts === 1) {
                        options.abortSignal?.addEventListener(
                            'abort',
                            () => {
                                input.events.push('cancel');
                                // ACP cancellation is a round trip to the bridge.
                                setTimeout(() => done.reject(new Error('cancelled')), 20);
                            },
                            { once: true }
                        );
                    } else {
                        options.emit({
                            type: 'finish',
                            finishReason: { raw: undefined, unified: 'stop' },
                            totalUsage: {
                                inputTokens: {
                                    noCache: 1,
                                    total: 1,
                                    cacheRead: undefined,
                                    cacheWrite: undefined,
                                },
                                outputTokens: { reasoning: undefined, text: 1, total: 1 },
                                raw: undefined,
                            },
                        });
                        done.resolve();
                    }
                    input.started.resolve();
                    return { done: done.promise, submitToolResult: async () => undefined };
                },
            };
        },
    };
}

function turnInput(harness: HarnessV1, signal: AbortSignal): HarnessTurnInput {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_test',
        agentName: 'Test',
        agentRoot: root,
        dataRoot: root,
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(root, 'home'),
        homeTimezone: 'UTC',
        initialRole: null,
        inbox: [],
        drainItemIds: [],
        inboxDelivery: 'concrete',
        serverId: 'srv_test',
        unreadElsewhere: [],
        warmDrainItemIds: [],
        modelId: 'test-model',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtimeId: 'codex',
        runtime,
        sessionGeneration: 1,
        signal,
        skillsDir: join(root, 'skills'),
        totalPending: 0,
        workspaceDir: join(root, 'workspace'),
        tools: {},
        harnessAgentFactory: (turn) =>
            new HarnessAgent({
                harness,
                id: turn.agentId,
                sandbox: createLocalTrustedSandboxProvider({ rootDir: root, runtime }),
            }),
    };
}
