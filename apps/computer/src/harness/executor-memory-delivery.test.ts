import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createIdleCompactionReporter } from '../idle-compaction-reporter.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import { compactionToolName, type TurnEvent } from '../runtime/turn-event.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';
import {
    instructionsTurnInput,
    instructionsWakeInput,
    type TestTurnOverrides,
} from './executor-instructions-fixtures.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const memoryTag = '<haus-memory>';

let agentRoot: string;
let compacts: boolean;
/** What the fake Agent writes to MEMORY.md during its next turn; null leaves the file alone. */
let agentEdit: string | null;
let restore: () => void;
let fake: ReturnType<typeof fakeRuntimeDriver<HarnessTurnInput>>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-memory-turn-'));
    await mkdir(join(agentRoot, 'workspace'));
    compacts = false;
    agentEdit = null;
    fake = fakeRuntimeDriver<HarnessTurnInput>({
        async *turn(): AsyncGenerator<TurnEvent> {
            if (agentEdit !== null) {
                await writeMemory(agentEdit);
                agentEdit = null;
            }
            if (compacts) {
                yield* compaction();
            }
            yield* finishedTurn();
        },
    });
    restore = setRuntimeDriverFactoryForTesting(fake.factory);
});

afterEach(async () => {
    restore();
    await rm(agentRoot, { force: true, recursive: true });
});

test('the first turn carries MEMORY.md and an unchanged file adds nothing after it', async () => {
    await writeMemory('# Cove\n\n## Role\nRelease manager.\n');
    await turn();
    await turn();

    expect(fake.record.prompts[0]).toContain(memoryTag);
    expect(fake.record.prompts[0]).toContain('Release manager.');
    expect(fake.record.prompts[1]).not.toContain(memoryTag);
});

test('a file changed outside the session is carried on the next turn; the Agent’s own edit is not', async () => {
    await writeMemory('# Cove\n');
    await turn();
    await writeMemory('# Cove\n\n## Standing Preferences\n- Use metric units.\n');
    await turn();
    agentEdit = '# Cove\n\n## Active Context\n- Shipping 18.3.\n';
    await turn();
    await turn();

    expect(fake.record.prompts[1]).toContain('Use metric units.');
    expect(fake.record.prompts[2]).not.toContain(memoryTag);
    expect(fake.record.prompts[3]).not.toContain(memoryTag);
});

test('a compacted turn resets the receipt, so the next turn carries the file again', async () => {
    await writeMemory('# Cove\n');
    await turn();
    compacts = true;
    await turn();
    compacts = false;
    await turn();
    await turn();

    expect(fake.record.prompts[1]).not.toContain(memoryTag);
    expect(fake.record.prompts[2]).toContain(memoryTag);
    expect(fake.record.prompts[3]).not.toContain(memoryTag);
});

test('an idle compaction between turns resets the receipt, so the next turn carries the file again', async () => {
    await writeMemory('# Cove\n');
    await turn();
    const hooks = createIdleCompactionReporter({
        agentBusy: () => false,
        agentsDir: dirname(agentRoot),
        journalSink: () => Promise.resolve(undefined),
        runtime,
        send: () => true,
        serverId: 'srv_test',
    });
    await hooks.report(
        agentRoot,
        { launchKey: 'launch', nativeSessionId: 'session', runtimeId: 'claude-code' },
        {
            costUsd: null,
            endedAt: new Date('2026-11-18T10:01:00.000Z'),
            modelId: 'claude-opus-5-5',
            startedAt: new Date('2026-11-18T10:00:00.000Z'),
            summary: 'Compacted.',
            tokensAfter: 1000,
            tokensBefore: 900_000,
            usage: null,
        }
    );
    await turn();
    await turn();

    expect(fake.record.prompts[1]).toContain(memoryTag);
    expect(fake.record.prompts[2]).not.toContain(memoryTag);
});

test('a fresh session generation carries the file again', async () => {
    await writeMemory('# Cove\n');
    await turn();
    await turn({ sessionGeneration: 2 });

    expect(fake.record.opens[1]?.resumeFrom).toBeUndefined();
    expect(fake.record.prompts[1]).toContain(memoryTag);
});

test('a missing file delivers nothing, and a file the Agent creates is not echoed back', async () => {
    await turn();
    agentEdit = '# Cove\n';
    await turn();
    await turn();

    for (const prompt of fake.record.prompts) {
        expect(prompt).not.toContain(memoryTag);
    }
});

test('a sub-agent wake defers a changed file to the next ordinary turn', async () => {
    await writeMemory('# Cove\n');
    await turn();
    await writeMemory('# Cove\n\n## Role\nOn call.\n');
    await runHarnessTurn(instructionsWakeInput({ agentRoot, runtime }, {}));
    await turn();

    expect(fake.record.prompts[1]).not.toContain(memoryTag);
    expect(fake.record.prompts[2]).toContain('On call.');
});

function turn(overrides: TestTurnOverrides = {}) {
    return runHarnessTurn(instructionsTurnInput({ agentRoot, runtime }, overrides));
}

async function writeMemory(content: string) {
    await writeFile(join(agentRoot, 'workspace', 'MEMORY.md'), content);
}

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
