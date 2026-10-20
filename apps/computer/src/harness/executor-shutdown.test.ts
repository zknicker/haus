import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { AttachmentDaemonWork } from '../attachment-daemon-work.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { readAgentSessionState } from './session-store.ts';

const conversation: RuntimeResumeState = { runtime: 'codex', threadId: 'thread_same', version: 1 };

for (const active of [true, false]) {
    test(`shutdown stops ${active ? 'an active' : 'a parked'} runtime session and the next Computer resumes its conversation`, async () => {
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
        const driver = lifecycleDriver({ active, events, resumes, started });
        await mkdir(join(root, 'workspace'), { recursive: true });
        const input = turnInput(root, runtime, driver, reservation.controller.signal);
        try {
            const turn = work.track(runHarnessTurn(input));
            await started.promise;
            if (!active) {
                await turn;
            }
            await work.close();
            expect((await turn).aborted).toBe(active);
            // A parked Haus resume state is already what a stop stores; shutdown does not reopen it.
            expect(events).toEqual(active ? ['cancel', 'stop'] : ['detach']);
            const stored = await readAgentSessionState(root);
            expect(stored?.generation).toBe(1);
            expect(stored?.runtimeSessionId).toBe('agt_test-1');
            expect(stored?.resumeState).toEqual(conversation);

            const nextRuntime = makeDaemonRuntime();
            try {
                const session = await driver
                    .factory(
                        { ...input, runtime: nextRuntime },
                        { env: {}, instructions: 'next Computer' }
                    )
                    .openSession({
                        resumeFrom: stored?.resumeState ?? undefined,
                        sessionId: stored?.runtimeSessionId ?? '',
                    });
                expect(session.isResume).toBe(true);
                expect(resumes.at(-1)).toEqual(conversation);
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

test('shutdown during resume creation is interrupted without invalidating the stored conversation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-shutdown-resume-'));
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const resumeStarted = Promise.withResolvers<void>();
    const events: string[] = [];
    let blockResume = false;
    const driver = lifecycleDriver({
        active: false,
        events,
        onResume: async (signal) => {
            if (!blockResume) {
                return;
            }
            blockResume = false;
            resumeStarted.resolve();
            await new Promise<void>((resolve) =>
                signal?.addEventListener('abort', () => resolve(), { once: true })
            );
            throw new Error('session creation cancelled');
        },
        resumes: [],
        started: Promise.withResolvers<void>(),
    });
    await mkdir(join(root, 'workspace'), { recursive: true });
    try {
        const controller = new AbortController();
        await work.track(runHarnessTurn(turnInput(root, runtime, driver, controller.signal)));
        const before = await readAgentSessionState(root);
        blockResume = true;
        const reservation = work.agentWork.reserve('agt_test', 'run_resume');
        if (reservation.kind !== 'reserved') {
            throw new Error('Missing reservation');
        }
        const turn = work.track(
            runHarnessTurn({
                ...turnInput(root, runtime, driver, reservation.controller.signal),
                runId: 'run_resume',
            })
        );
        await resumeStarted.promise;
        await work.close();
        expect((await turn).aborted).toBe(true);
        const after = await readAgentSessionState(root);
        expect(after?.generation).toBe(before?.generation);
        expect(after?.runtimeSessionId).toBe(before?.runtimeSessionId);
        expect(after?.resumeState).toEqual(conversation);
        expect(events).toEqual(['detach']);
    } finally {
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
});

function lifecycleDriver(input: {
    active: boolean;
    events: string[];
    onResume?: (signal: AbortSignal | undefined) => Promise<void>;
    resumes: unknown[];
    started: ReturnType<typeof Promise.withResolvers<void>>;
}) {
    return fakeRuntimeDriver<HarnessTurnInput>({
        destroy: () => input.events.push('destroy'),
        detach: () => {
            input.events.push('detach');
            return conversation;
        },
        open: async ({ resumeFrom, signal }) => {
            if (resumeFrom) {
                input.resumes.push(resumeFrom);
                await input.onResume?.(signal);
            }
        },
        stop: () => {
            input.events.push('stop');
            return conversation;
        },
        turn: ({ signal }) => {
            input.started.resolve();
            return input.active ? cancelledTurn(signal, input.events) : finishedTurn();
        },
    });
}

async function* cancelledTurn(signal: AbortSignal, events: string[]): AsyncGenerator<TurnEvent> {
    if (!signal.aborted) {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    }
    events.push('cancel');
    yield { type: 'abort' };
}

function turnInput(
    root: string,
    runtime: ReturnType<typeof makeDaemonRuntime>,
    driver: ReturnType<typeof lifecycleDriver>,
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
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtimeId: 'codex',
        runtime,
        sessionGeneration: 1,
        signal,
        skillsDir: join(root, 'skills'),
        totalPending: 0,
        workspaceDir: join(root, 'workspace'),
        tools: [],
        runtimeDriverFactory: driver.factory,
    };
}
