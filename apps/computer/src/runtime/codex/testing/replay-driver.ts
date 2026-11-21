import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeDriver, RuntimeSession } from '../../driver.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { type CodexWorkerDriverOptions, createCodexWorkerDriver } from '../codex-worker-driver.ts';
import type { CaptureStep } from '../fixtures/capture-scenarios.ts';
import { type ReplayTransport, readFixture, replayTransport } from './replay-transport.ts';

/** Fixture paths were scrubbed to this root; the driver sees the same workspace. */
export const FIXTURE_WORKSPACE = '<root>/workspace';

export interface ReplayHarness {
    readonly driver: RuntimeDriver;
    readonly transports: ReplayTransport[];
}

/** A Codex driver whose app-server processes replay one recorded fixture, in order. */
export function replayDriver(
    fixture: string,
    overrides: Partial<CodexWorkerDriverOptions> = {}
): ReplayHarness {
    const records = readFixture(fixture);
    const transports: ReplayTransport[] = [];
    const driver = testCodexDriver(() => {
        const transport = replayTransport(records, transports.length + 1);
        transports.push(transport);
        return transport;
    }, overrides);
    return { driver, transports };
}

/** A Codex Worker driver over test transports, in a throwaway HOME with no Codex login. */
export function testCodexDriver(
    spawn: NonNullable<CodexWorkerDriverOptions['spawn']>,
    overrides: Partial<CodexWorkerDriverOptions> = {}
): RuntimeDriver {
    return createCodexWorkerDriver({
        cwd: FIXTURE_WORKSPACE,
        env: {},
        homeDir: join(mkdtempSync(join(tmpdir(), 'haus-codex-test-')), 'home'),
        modelId: 'gpt-5.6-luna',
        resolveExecutable: () => Promise.resolve({ env: {}, path: '/usr/bin/false' }),
        spawn,
        writableRoots: [],
        ...overrides,
    });
}

export interface StepOutcome {
    events: TurnEvent[];
    session: RuntimeSession | undefined;
    steered: Awaited<ReturnType<RuntimeSession['steer']>>[];
}

/** Runs one capture step the way the capture script ran it. */
export async function replayStep(
    step: CaptureStep,
    session: RuntimeSession | undefined,
    driver: RuntimeDriver
): Promise<StepOutcome> {
    if (step.kind === 'open') {
        return {
            events: [],
            session: await driver.openSession({
                resumeFrom: step.resumeFrom,
                sessionId: 'fixture',
            }),
            steered: [],
        };
    }
    if (step.kind === 'stop') {
        const state = await session?.stop();
        return {
            events: [],
            session: await driver.openSession({ resumeFrom: state, sessionId: 'fixture' }),
            steered: [],
        };
    }
    if (!session) {
        throw new Error('No session to run a turn on.');
    }
    const abort = new AbortController();
    const turn = await session.startTurn({ prompt: step.prompt, signal: abort.signal });
    const events: TurnEvent[] = [];
    const steered: StepOutcome['steered'] = [];
    let acted = false;
    for await (const event of turn.events) {
        events.push(event);
        if (!acted && step.on && event.type === step.on.event) {
            acted = true;
            if (step.on.action === 'abort') {
                abort.abort();
            } else {
                steered.push(await session.steer(step.on.text));
            }
        }
    }
    await turn.settle();
    return { events, session, steered };
}

/** Event types without liveness, for compact sequence assertions. */
export function eventSequence(events: readonly TurnEvent[]): string[] {
    return events
        .filter((event) => event.type !== 'progress')
        .map((event) =>
            event.type === 'tool-call' ||
            event.type === 'tool-result' ||
            event.type === 'tool-error'
                ? `${event.type}:${event.toolName}`
                : event.type
        );
}
