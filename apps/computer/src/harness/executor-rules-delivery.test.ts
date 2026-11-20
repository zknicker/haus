import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { agentDrive } from '../drive/agent-drive.ts';
import { createIdleCompactionReporter } from '../idle-compaction-reporter.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import { compactionToolName, type TurnEvent } from '../runtime/turn-event.ts';
import {
    instructionsTurnInput,
    instructionsWakeInput,
    type TestTurnOverrides,
} from './executor-instructions-fixtures.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const rulesTag = '<haus-rules>';
const agentRules = 'agents/harbor/AGENTS.md';
const hausRules = 'haus/AGENTS.md';

let agentRoot: string;
let compacts: boolean;
let agentEdit: string | null;
let duringTurn: (() => Promise<void>) | null;
let restore: () => void;
let fake: ReturnType<typeof fakeRuntimeDriver<HarnessTurnInput>>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-rules-turn-'));
    await mkdir(agentDrive(agentRoot, 'harbor').area, { recursive: true });
    compacts = false;
    agentEdit = null;
    duringTurn = null;
    fake = fakeRuntimeDriver<HarnessTurnInput>({
        async *turn() {
            if (agentEdit !== null) {
                await writeRules(agentRules, agentEdit);
                agentEdit = null;
            }
            await duringTurn?.();
            duringTurn = null;
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

test('the first turn carries the Haus rules, then the Agent’s own, ahead of the input', async () => {
    await writeRules(hausRules, '- Answer in the Task.\n');
    await writeRules(agentRules, '- Keep replies under three sentences.\n');
    await turn();
    await turn();

    const first = fake.record.prompts[0] ?? '';
    expect(first.startsWith(rulesTag)).toBe(true);
    expect(first).toContain(`The rules in ${hausRules}, as they are now.`);
    expect(first.indexOf('- Answer in the Task.')).toBeLessThan(
        first.indexOf('- Keep replies under three sentences.')
    );
    expect(fake.record.prompts[1]).not.toContain(rulesTag);
});

test('a rule written outside the session arrives on the next turn; the Agent’s own edit is not echoed', async () => {
    await turn();
    await writeRules(agentRules, '- Every reply cites its source.\n');
    await turn();
    agentEdit = '- Keep replies under three sentences.\n';
    await turn();
    await turn();

    expect(fake.record.prompts[0]).not.toContain(rulesTag);
    expect(fake.record.prompts[1]).toContain(`The rules in ${agentRules}, as they are now.`);
    expect(fake.record.prompts[1]).toContain('- Every reply cites its source.');
    expect(fake.record.prompts[2]).not.toContain(rulesTag);
    expect(fake.record.prompts[3]).not.toContain(rulesTag);
});

test('a session reset carries the Agent’s rules into the fresh session', async () => {
    agentEdit = '- Keep replies under three sentences.\n';
    await turn();
    await turn();
    await turn({ sessionGeneration: 2 });

    expect(fake.record.prompts[1]).not.toContain(rulesTag);
    expect(fake.record.opens[2]?.resumeFrom).toBeUndefined();
    expect(fake.record.prompts[2]).toContain('- Keep replies under three sentences.');
});

test('a compacted turn resets the receipts, so the next turn carries the rules again', async () => {
    await writeRules(agentRules, '- Keep replies under three sentences.\n');
    await turn();
    compacts = true;
    await turn();
    compacts = false;
    await turn();
    await turn();

    expect(fake.record.prompts[1]).not.toContain(rulesTag);
    expect(fake.record.prompts[2]).toContain('- Keep replies under three sentences.');
    expect(fake.record.prompts[3]).not.toContain(rulesTag);
});

test('an idle compaction between turns resets the receipts, so the next turn carries the rules again', async () => {
    await writeRules(agentRules, '- Keep replies under three sentences.\n');
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
            endedAt: new Date('2026-11-20T10:01:00.000Z'),
            modelId: 'claude-opus-5-5',
            startedAt: new Date('2026-11-20T10:00:00.000Z'),
            summary: 'Compacted.',
            tokensAfter: 1000,
            tokensBefore: 900_000,
            usage: null,
        }
    );
    await turn();
    await turn();

    expect(fake.record.prompts[1]).toContain('- Keep replies under three sentences.');
    expect(fake.record.prompts[2]).not.toContain(rulesTag);
});

test('a deleted rules file is announced once', async () => {
    await writeRules(agentRules, '- Keep replies under three sentences.\n');
    await turn();
    await rm(join(agentDrive(agentRoot, 'harbor').folder, agentRules));
    await turn();
    await turn();

    expect(fake.record.prompts[1]).toContain(
        `${agentRules} was deleted, so its rules no longer apply.`
    );
    expect(fake.record.prompts[2]).not.toContain(rulesTag);
});

test('a rules path unreadable at turn start (a directory: EISDIR even for root) is carried once it reads again', async () => {
    const file = join(agentDrive(agentRoot, 'harbor').folder, agentRules);
    await mkdir(file, { recursive: true });
    duringTurn = async () => {
        await rm(file, { recursive: true });
        await writeRules(agentRules, '- Keep replies under three sentences.\n');
    };
    await turn();
    await turn();

    expect(fake.record.prompts[0]).not.toContain(rulesTag);
    expect(fake.record.prompts[1]).toContain('- Keep replies under three sentences.');
});

test('a sub-agent wake defers a changed rules file to the next ordinary turn', async () => {
    await turn();
    await writeRules(agentRules, '- Keep replies under three sentences.\n');
    await runHarnessTurn(instructionsWakeInput({ agentRoot, runtime }, {}));
    await turn();

    expect(fake.record.prompts[1]).not.toContain(rulesTag);
    expect(fake.record.prompts[2]).toContain('- Keep replies under three sentences.');
});

function turn(overrides: TestTurnOverrides = {}) {
    return runHarnessTurn(instructionsTurnInput({ agentRoot, runtime }, overrides));
}

async function writeRules(path: string, content: string) {
    const file = join(agentDrive(agentRoot, 'harbor').folder, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
}

function compaction() {
    const facts = {
        dynamic: true,
        providerExecuted: true,
        toolCallId: `compaction-${fake.record.prompts.length}`,
        toolName: compactionToolName,
    } as const;
    const events: TurnEvent[] = [
        { ...facts, input: {}, type: 'tool-call' },
        { ...facts, output: {}, type: 'tool-result' },
    ];
    return events;
}
