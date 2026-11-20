import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeDriver, RuntimeSession } from '../../driver.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { WarmProcessPool } from '../../warm-pool.ts';
import { type CodexDriverOptions, createCodexDriver } from '../codex-driver.ts';
import type { CaptureStep } from '../fixtures/capture-scenarios.ts';
import { type ReplayTransport, readFixture, replayTransport } from './replay-transport.ts';

/** The warm pool every test driver shares, like the Computer-wide one. */
export const testWarmPool = new WarmProcessPool({
    onCloseError: (error) => {
        throw error;
    },
});

/** Fixture paths were scrubbed to this root; the driver sees the same workspace. */
export const FIXTURE_WORKSPACE = '<root>/workspace';

export interface ReplayHarness {
    readonly driver: RuntimeDriver;
    readonly transports: ReplayTransport[];
}

/** A Codex driver whose app-server processes replay one recorded fixture, in order. */
export function replayDriver(
    fixture: string,
    overrides: Partial<CodexDriverOptions> = {}
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

/** A Codex driver over test transports, in a throwaway Agent HOME with no Codex login. */
export function testCodexDriver(
    spawn: NonNullable<CodexDriverOptions['spawn']>,
    overrides: Partial<CodexDriverOptions> = {}
): RuntimeDriver {
    const root = mkdtempSync(join(tmpdir(), 'haus-codex-test-'));
    const homeDir = overrides.homeDir ?? join(root, 'home');
    return createCodexDriver({
        env: {},
        homeDir,
        // One Agent per HOME, as the executor keys the Computer's warm pool by Agent.
        warm: { key: homeDir, pool: testWarmPool },
        hostHomeDir: join(root, 'host'),
        hostToolServer: fakeHostToolServer(),
        instructions: 'You are a Haus test Agent. Follow the user exactly.',
        modelId: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        resolveExecutable: () => Promise.resolve({ env: {}, path: '/usr/bin/false' }),
        spawn,
        tools: [],
        workspaceDir: FIXTURE_WORKSPACE,
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

function fakeHostToolServer(): Pick<HostToolServer, 'openSession'> {
    return {
        openSession: () => ({
            close: () => undefined,
            mcp: {
                headers: { Authorization: 'Bearer replay-token' },
                name: 'haus',
                transport: 'http',
                url: 'http://127.0.0.1:9/mcp',
            },
            replaceTools: () => undefined,
        }),
    };
}
