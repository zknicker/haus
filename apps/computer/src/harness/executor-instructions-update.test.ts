import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hausAgentVersion } from '@haus/api';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';
import {
    instructionsTurnInput,
    instructionsWakeInput,
    readSessionFile,
    type TestTurnOverrides,
    updateOpening,
    updateTag,
    writeSessionFile,
} from './executor-instructions-fixtures.ts';
import { harnessSessionOwner } from './session-lifecycle.ts';
import type { AgentSessionState } from './session-store.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const productVersion = process.env.HAUS_COMPUTER_PRODUCT_VERSION;

let agentRoot: string;
let streamAborts: boolean;
let stopOnOpen: boolean;
let restore: () => void;
let fake: ReturnType<typeof fakeRuntimeDriver<HarnessTurnInput>>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-instructions-update-'));
    streamAborts = false;
    stopOnOpen = false;
    fake = fakeRuntimeDriver<HarnessTurnInput>({
        // Stop lands once the session is live, before the turn's prompt is sent.
        open: () => {
            if (stopOnOpen) {
                void harnessSessionOwner(runtime).stopAgent(agentRoot);
            }
        },
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
        resumeFrom: first.resumeState ?? undefined,
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
    expect(fake.record.opens[2]?.resumeFrom).toEqual(session.resumeState ?? undefined);
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

test('an interrupted fresh launch still records the instructions it launched on', async () => {
    streamAborts = true;
    await runHarnessTurn(turnInput());
    expect((await readSession()).deliveredInstructionFingerprint).toEqual(expect.any(String));

    streamAborts = false;
    await runHarnessTurn(turnInput());

    expect(fake.record.opens[1]?.resumeFrom).toBeDefined();
    expect(fake.record.prompts[1]).not.toContain(updateTag);
});

test('a fresh launch stopped before its prompt still records the instructions it launched on', async () => {
    stopOnOpen = true;
    const stopped = await runHarnessTurn(turnInput());
    expect(stopped.aborted).toBe(true);
    expect(fake.record.prompts).toHaveLength(0);
    expect((await readSession()).deliveredInstructionFingerprint).toEqual(expect.any(String));

    stopOnOpen = false;
    await runHarnessTurn(turnInput());

    expect(fake.record.opens[1]?.resumeFrom).toBeDefined();
    expect(fake.record.prompts[0]).not.toContain(updateTag);
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

function turnInput(overrides: TestTurnOverrides = {}): HarnessTurnInput {
    return instructionsTurnInput({ agentRoot, runtime }, overrides);
}

function wakeInput(overrides: TestTurnOverrides): HarnessTurnInput {
    return instructionsWakeInput({ agentRoot, runtime }, overrides);
}

function readSession(): Promise<AgentSessionState> {
    return readSessionFile(agentRoot);
}

function writeSession(session: AgentSessionState): Promise<void> {
    return writeSessionFile(agentRoot, session);
}
