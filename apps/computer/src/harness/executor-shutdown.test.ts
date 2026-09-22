import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { AttachmentDaemonWork } from '../attachment-daemon-work.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { readAgentSessionState } from './session-store.ts';

for (const active of [true, false]) {
    test(`shutdown stops ${active ? 'an active' : 'a parked'} SDK session and the next Computer resumes its conversation`, async () => {
        const root = await mkdtemp(join(tmpdir(), 'haus-executor-shutdown-'));
        const runtime = makeDaemonRuntime();
        const work = new AttachmentDaemonWork(runtime);
        const reservation = work.agentWork.reserve('agt_test', 'run_test');
        if (reservation.kind !== 'reserved') {
            throw new Error('Missing reservation');
        }
        const started = Promise.withResolvers<void>();
        const events: string[] = [];
        const resumes: unknown[] = [];
        const harness = lifecycleHarness({ active, events, resumes, started });
        await mkdir(join(root, 'workspace'), { recursive: true });
        const input = turnInput(root, runtime, harness, reservation.controller.signal);
        try {
            const turn = work.track(runHarnessTurn(input));
            await started.promise;
            if (!active) {
                await turn;
            }
            await work.close();
            expect((await turn).aborted).toBe(active);
            expect(events).toEqual(active ? ['cancel', 'stop'] : ['detach', 'stop']);
            const stored = await readAgentSessionState(root);
            expect(stored?.generation).toBe(1);
            expect(stored?.runtimeSessionId).toBe('agt_test-1');
            expect(stored?.resumeState?.data).toEqual({ conversation: 'same' });
            expect(stored?.resumeState).not.toHaveProperty('continueFrom');
            const nextRuntime = makeDaemonRuntime();
            const nextAgent = new HarnessAgent({
                harness,
                id: 'agt_test',
                sandbox: createLocalTrustedSandboxProvider({ rootDir: root, runtime: nextRuntime }),
            });
            try {
                const session = await nextAgent.createSession({
                    sessionId: stored!.runtimeSessionId!,
                    resumeFrom: stored!.resumeState as HarnessAgentResumeSessionState,
                });
                expect(session.isResume).toBe(true);
                expect(resumes.at(-1)).toEqual({ conversation: 'same' });
                await session.stop();
            } finally {
                await nextRuntime.dispose();
            }
        } finally {
            await work.close();
            await runtime.dispose();
            await rm(root, { recursive: true, force: true });
        }
    });
}

function lifecycleHarness(input: {
    active: boolean;
    events: string[];
    resumes: unknown[];
    started: ReturnType<typeof Promise.withResolvers<void>>;
}): HarnessV1 {
    const state = {
        data: { conversation: 'same' },
        harnessId: 'shutdown-test',
        specificationVersion: 'harness-v1',
        type: 'resume-session',
    } as const;
    return {
        builtinTools: {},
        harnessId: 'shutdown-test',
        specificationVersion: 'harness-v1',
        doStart: async (options) => {
            input.resumes.push(options.resumeFrom?.data);
            return {
                sessionId: options.sessionId,
                isResume: !!options.resumeFrom,
                doCompact: async () => undefined,
                doContinueTurn: async () => {
                    throw new Error('must not suspend');
                },
                doDestroy: async () => {
                    input.events.push('destroy');
                },
                doDetach: async () => {
                    input.events.push('detach');
                    return { ...state, data: { connection: 'live' } };
                },
                doStop: async () => {
                    input.events.push('stop');
                    return state;
                },
                doSuspendTurn: async () => {
                    throw new Error('shutdown must reach idle before stop');
                },
                doPromptTurn: async (options) => {
                    const done = Promise.withResolvers<void>();
                    if (input.active) {
                        const cancel = () => {
                            input.events.push('cancel');
                            done.reject(new Error('cancelled'));
                        };
                        options.abortSignal?.addEventListener('abort', cancel, { once: true });
                        if (options.abortSignal?.aborted) {
                            cancel();
                        }
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

function turnInput(
    root: string,
    runtime: ReturnType<typeof makeDaemonRuntime>,
    harness: HarnessV1,
    signal: AbortSignal
): HarnessTurnInput {
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
        webAccess: null,
        workspaceDir: join(root, 'workspace'),
        tools: {},
        harnessAgentFactory: (input) =>
            new HarnessAgent({
                harness,
                id: input.agentId,
                sandbox: createLocalTrustedSandboxProvider({ rootDir: root, runtime }),
            }),
    };
}

test('shutdown during resume creation is interrupted without invalidating the stored conversation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-shutdown-resume-'));
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const started = Promise.withResolvers<void>();
    const resumeStarted = Promise.withResolvers<void>();
    const events: string[] = [];
    const base = lifecycleHarness({ active: false, events, resumes: [], started });
    let blockResume = false;
    const harness: HarnessV1 = {
        ...base,
        doStart: async (options) => {
            if (blockResume && options.resumeFrom) {
                blockResume = false;
                resumeStarted.resolve();
                await new Promise<void>((resolve) =>
                    options.abortSignal?.addEventListener('abort', () => resolve(), { once: true })
                );
                throw new Error('session creation cancelled');
            }
            return base.doStart(options);
        },
    };
    await mkdir(join(root, 'workspace'), { recursive: true });
    try {
        const controller = new AbortController();
        await work.track(runHarnessTurn(turnInput(root, runtime, harness, controller.signal)));
        const before = await readAgentSessionState(root);
        blockResume = true;
        const reservation = work.agentWork.reserve('agt_test', 'run_resume');
        if (reservation.kind !== 'reserved') {
            throw new Error('Missing reservation');
        }
        const turn = work.track(
            runHarnessTurn({
                ...turnInput(root, runtime, harness, reservation.controller.signal),
                runId: 'run_resume',
            })
        );
        await resumeStarted.promise;
        await work.close();
        expect((await turn).aborted).toBe(true);
        const after = await readAgentSessionState(root);
        expect(after?.generation).toBe(before?.generation);
        expect(after?.runtimeSessionId).toBe(before?.runtimeSessionId);
        expect(after?.resumeState?.data).toEqual({ conversation: 'same' });
        expect(events).toEqual(['detach', 'stop']);
    } finally {
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
});
