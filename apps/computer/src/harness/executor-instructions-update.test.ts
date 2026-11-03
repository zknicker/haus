import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hausAgentVersion } from '@haus/api';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';
import type { AgentSessionState } from './session-store.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const updateOpening =
    '<haus-instructions-update>\nHaus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.\n\n';
const updateTag = '<haus-instructions-update>';
const productVersion = process.env.HAUS_COMPUTER_PRODUCT_VERSION;

let agentRoot: string;
let streamAborts: boolean;
let restore: () => void;
let fake: ReturnType<typeof fakeRuntimeDriver<HarnessTurnInput>>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-instructions-update-'));
    streamAborts = false;
    fake = fakeRuntimeDriver<HarnessTurnInput>({
        turn: (): TurnEvent[] =>
            streamAborts
                ? [{ contextTokens: null, type: 'step-finish', usage: null }, { type: 'abort' }]
                : finishedTurn(),
    });
    restore = setRuntimeDriverFactoryForTesting(fake.factory);
});

afterEach(async () => {
    restore();
    if (productVersion === undefined) {
        Reflect.deleteProperty(process.env, 'HAUS_COMPUTER_PRODUCT_VERSION');
    } else {
        process.env.HAUS_COMPUTER_PRODUCT_VERSION = productVersion;
    }
    await rm(agentRoot, { force: true, recursive: true });
});

test('a resumed session hears changed instructions at the front of its next turn, once', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const first = await readSession();
    const appliedAt = '2026-08-27T12:00:00.000Z';
    await writeSession({
        ...first,
        hausAgentAppliedAt: appliedAt,
        hausAgentStatus: 'current',
        hausAgentVersion: '0.9.0',
    });
    const activity: string[] = [];

    await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.', activity }));

    expect(fake.record.launches[0]?.options.instructions).toContain('Own the original lane.');
    expect(fake.record.launches[1]?.options.instructions).toContain('Own the updated lane.');
    expect(fake.record.prompts[0]).not.toContain(updateTag);
    const updated = fake.record.prompts[1] ?? '';
    expect(updated.startsWith(updateOpening)).toBe(true);
    expect(updated).toContain('Own the updated lane.');
    expect(updated).not.toContain('Own the original lane.');
    expect(updated).toContain('This may evolve.\n</haus-instructions-update>\n\n');
    expect(updated.indexOf('</haus-instructions-update>')).toBeLessThan(
        updated.indexOf('Hello Cove')
    );
    // The same native conversation resumed; nothing parked or rotated it.
    expect(fake.record.opens[1]).toEqual({
        resumeFrom: first.resumeState,
        sessionId: 'agt_test-1',
    });
    expect(fake.record.counts).toMatchObject({ refresh: 0, stop: 0 });
    const session = await readSession();
    expect(session.hausAgentAppliedAt).not.toBe(appliedAt);
    expect(session.generation).toBe(1);
    expect(session.deliveredInstructionFingerprint).toEqual(expect.any(String));
    expect(session.deliveredInstructionFingerprint).not.toBe(first.deliveredInstructionFingerprint);
    expect(session.instructionFingerprint).not.toBe(first.instructionFingerprint);
    expect(session).toMatchObject({ hausAgentStatus: 'current', hausAgentVersion });
    expect(activity).toEqual([
        'updating_instructions:started',
        'thinking:started',
        'thinking:completed',
        'updating_instructions:completed',
    ]);

    const settled: string[] = [];
    await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.', activity: settled }));

    expect(fake.record.prompts[2]).not.toContain(updateTag);
    expect(fake.record.opens[2]?.resumeFrom).toEqual(session.resumeState);
    expect(settled).toEqual(['thinking:started', 'thinking:completed']);
    expect(fake.record.counts).toMatchObject({ refresh: 0, stop: 0 });
});

test('a release that changes only host facts re-delivers nothing', async () => {
    process.env.HAUS_COMPUTER_PRODUCT_VERSION = '1.0.0';
    await runHarnessTurn(turnInput());
    const first = await readSession();
    process.env.HAUS_COMPUTER_PRODUCT_VERSION = '1.0.1';

    await runHarnessTurn(turnInput());

    expect(fake.record.launches[1]?.options.instructions).toContain('- Runtime: 1.0.1');
    expect(fake.record.prompts[1]).not.toContain(updateTag);
    // The session still runs on what it launched with, and its receipt says so.
    const session = await readSession();
    expect(session.deliveredInstructionFingerprint).toBe(first.deliveredInstructionFingerprint);
    expect(session.instructionFingerprint).toBe(first.instructionFingerprint);
});

test('a resumed session with no delivery record gets the current instructions once', async () => {
    await runHarnessTurn(turnInput());
    const { deliveredInstructionFingerprint: _delivered, ...legacy } = await readSession();
    await writeFile(join(agentRoot, 'session.json'), `${JSON.stringify(legacy)}\n`);

    await runHarnessTurn(turnInput());
    await runHarnessTurn(turnInput());

    expect(fake.record.prompts[1]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[2]).not.toContain(updateTag);
    expect((await readSession()).deliveredInstructionFingerprint).toEqual(expect.any(String));
});

test('an interrupted update turn keeps the old receipt, so the next turn re-delivers', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const first = await readSession();
    streamAborts = true;

    const aborted = await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.' }));

    expect(aborted.aborted).toBe(true);
    expect(fake.record.prompts[1]?.startsWith(updateOpening)).toBe(true);
    expect(await readSession()).toMatchObject({
        deliveredInstructionFingerprint: first.deliveredInstructionFingerprint,
        instructionFingerprint: first.instructionFingerprint,
        interruptedTurn: true,
    });

    streamAborts = false;
    await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.' }));
    await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.' }));

    expect(fake.record.prompts[2]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[3]).not.toContain(updateTag);
});

test('a sub-agent wake neither carries nor records an update; the next ordinary turn does', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const first = await readSession();
    await writeSession({ ...first, hausAgentStatus: 'current', hausAgentVersion: '0.9.0' });
    const activity: string[] = [];

    await runHarnessTurn(wakeInput({ initialRole: 'Own the updated lane.', activity }));

    expect(fake.record.wakes[1]).toBe(true);
    expect(fake.record.prompts[1]).not.toContain(updateTag);
    // Version drift waits on the instructions it covers: pending, never claimed current.
    expect(await readSession()).toMatchObject({
        deliveredInstructionFingerprint: first.deliveredInstructionFingerprint,
        hausAgentStatus: 'pending',
        hausAgentVersion: '0.9.0',
        instructionFingerprint: first.instructionFingerprint,
    });
    expect(activity).toEqual(['thinking:started', 'thinking:completed']);

    await runHarnessTurn(turnInput({ initialRole: 'Own the updated lane.' }));

    expect(fake.record.prompts[2]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[2]).toContain('Own the updated lane.');
    expect(await readSession()).toMatchObject({ hausAgentStatus: 'current', hausAgentVersion });
});

type TestTurnOverrides = Partial<Omit<HarnessTurnInput, 'activity'>> & { activity?: string[] };

function turnInput(overrides: TestTurnOverrides = {}): HarnessTurnInput {
    const { activity, ...rest } = overrides;
    return {
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            activity?.push(`${category}:${phase}`)
        ),
        agentId: 'agt_test',
        agentName: 'Cove',
        agentRoot,
        dataRoot: agentRoot,
        drainItemIds: ['msg_test'],
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [
            {
                chatId: 'cht_test',
                content: 'Hello Cove',
                createdAt: '2026-07-27T00:00:00.000Z',
                id: 'msg_test',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: 'dm:@operator',
            },
        ],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: 'claude-opus-4-8',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtime,
        runtimeId: 'claude-code',
        serverId: 'srv_test',
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        tools: [],
        totalPending: 1,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(agentRoot, 'workspace'),
        ...rest,
    };
}

function wakeInput(overrides: TestTurnOverrides): HarnessTurnInput {
    return turnInput({
        drainItemIds: [],
        inbox: [],
        subagentWake: { createdAt: '2026-10-21T10:00:00.000Z', id: 'subagent:agt_test:wake_1' },
        totalPending: 0,
        ...overrides,
    });
}

async function readSession(): Promise<AgentSessionState> {
    return JSON.parse(await readFile(join(agentRoot, 'session.json'), 'utf8')) as AgentSessionState;
}

async function writeSession(session: AgentSessionState): Promise<void> {
    await writeFile(join(agentRoot, 'session.json'), `${JSON.stringify(session)}\n`);
}
