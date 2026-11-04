import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import { compactionToolName, type TurnEvent } from '../runtime/turn-event.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';
import {
    instructionsTurnInput,
    readSessionFile,
    updateOpening,
    updateTag,
} from './executor-instructions-fixtures.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const original = 'Own the original lane.';
const updated = 'Own the updated lane.';

let agentRoot: string;
let compacts: boolean;
let restore: () => void;
let fake: ReturnType<typeof fakeRuntimeDriver<HarnessTurnInput>>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-instructions-compaction-'));
    compacts = false;
    fake = fakeRuntimeDriver<HarnessTurnInput>({
        turn: (): TurnEvent[] => (compacts ? [...compaction(), ...finishedTurn()] : finishedTurn()),
    });
    restore = setRuntimeDriverFactoryForTesting(fake.factory);
});

afterEach(async () => {
    restore();
    await rm(agentRoot, { force: true, recursive: true });
});

test('a compaction after an update reverts the session to its launch instructions; the next turn re-delivers', async () => {
    await turn(original);
    await turn(updated);
    expect(fake.record.prompts[1]?.startsWith(updateOpening)).toBe(true);

    compacts = true;
    await turn(updated);
    compacts = false;
    await turn(updated);
    await turn(updated);

    expect(fake.record.prompts[2]).not.toContain(updateTag);
    expect(fake.record.prompts[3]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[3]).toContain(updated);
    expect(fake.record.prompts[4]).not.toContain(updateTag);
});

test('a compaction on the update turn itself re-delivers on the next turn', async () => {
    await turn(original);

    compacts = true;
    await turn(updated);
    compacts = false;
    await turn(updated);
    await turn(updated);

    expect(fake.record.prompts[1]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[2]?.startsWith(updateOpening)).toBe(true);
    expect(fake.record.prompts[3]).not.toContain(updateTag);
});

test('a compaction on a session launched on the current instructions re-delivers nothing', async () => {
    await turn(original);
    const launched = await readSessionFile(agentRoot);

    compacts = true;
    await turn(original);
    await turn(original);
    compacts = false;
    await turn(original);

    for (const prompt of fake.record.prompts) {
        expect(prompt).not.toContain(updateTag);
    }
    expect((await readSessionFile(agentRoot)).deliveredInstructionFingerprint).toBe(
        launched.deliveredInstructionFingerprint
    );
});

function turn(initialRole: string) {
    return runHarnessTurn(instructionsTurnInput({ agentRoot, runtime }, { initialRole }));
}

/** A runtime's context compaction, as every driver reports it. */
function compaction(): TurnEvent[] {
    const facts = {
        dynamic: true,
        providerExecuted: true,
        toolCallId: `compaction-${fake.record.prompts.length}`,
        toolName: compactionToolName,
    } as const;
    return [
        { ...facts, input: {}, type: 'tool-call' },
        { ...facts, output: {}, type: 'tool-result' },
    ];
}
