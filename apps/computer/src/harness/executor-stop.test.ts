import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { readAgentSessionState } from './session-store.ts';

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
    const driver = stopDriver({ events, hangFirstPrompt: true, started });
    const stop = new AbortController();
    const stopped = runHarnessTurn(turnInput(driver, stop.signal));
    await started.promise;
    stop.abort();
    expect((await stopped).aborted).toBe(true);
    const parked = await readAgentSessionState(root);
    expect(parked?.resumeState).not.toHaveProperty('continueFrom');

    const next = await runHarnessTurn(turnInput(driver, new AbortController().signal));
    expect(next.aborted).toBe(false);
    // Bootstrap drift may park and restart the native session first; it never sees a continuation.
    expect(events.slice(0, 3)).toEqual(['prompt', 'cancel', 'detach']);
    expect(events.filter((event) => event === 'prompt')).toHaveLength(2);
});

test('the turn after a Stop tells the Agent Haus interrupted it, once', async () => {
    const events: string[] = [];
    const started = Promise.withResolvers<void>();
    const driver = stopDriver({ events, hangFirstPrompt: true, started });
    const stop = new AbortController();
    const stopped = runHarnessTurn(turnInput(driver, stop.signal));
    await started.promise;
    stop.abort();
    await stopped;
    expect((await readAgentSessionState(root))?.interruptedTurn).toBe(true);

    await runHarnessTurn(turnInput(driver, new AbortController().signal));
    await runHarnessTurn(turnInput(driver, new AbortController().signal));

    const interrupted = 'Your previous turn was interrupted by Haus';
    const prompts = driver.record.prompts;
    expect(prompts.map((prompt) => prompt.includes(interrupted))).toEqual([false, true, false]);
    expect(prompts[1]).toContain('nobody declined it');
    expect(await readAgentSessionState(root)).not.toHaveProperty('interruptedTurn');
});

/** Cancellation settles a beat after abort, as a runtime round trip does. */
function stopDriver(input: {
    events: string[];
    hangFirstPrompt: boolean;
    started: ReturnType<typeof Promise.withResolvers<void>>;
}) {
    let prompts = 0;
    return fakeRuntimeDriver<HarnessTurnInput>({
        destroy: () => input.events.push('destroy'),
        detach: () => {
            input.events.push('detach');
            return { runtime: 'codex', threadId: 'thread_same', version: 1 };
        },
        open: ({ resumeFrom }) => {
            if (resumeFrom) {
                input.events.push('resume');
            }
        },
        stop: () => {
            input.events.push('stop');
            return { runtime: 'codex', threadId: 'thread_same', version: 1 };
        },
        turn: ({ signal }) => {
            input.events.push('prompt');
            prompts += 1;
            input.started.resolve();
            return input.hangFirstPrompt && prompts === 1
                ? cancelledTurn(signal, input.events)
                : finishedTurn();
        },
    });
}

async function* cancelledTurn(signal: AbortSignal, events: string[]): AsyncGenerator<TurnEvent> {
    if (!signal.aborted) {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    }
    events.push('cancel');
    await Bun.sleep(20);
    yield { type: 'abort' };
}

function turnInput(driver: ReturnType<typeof stopDriver>, signal: AbortSignal): HarnessTurnInput {
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
