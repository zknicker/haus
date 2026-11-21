import { afterEach, beforeEach, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { askedMessage, refusedMessage } from './claude-tool-gate.ts';
import {
    claudeWorkerQuestionsMinVersion,
    createClaudeWorkerDriver,
} from './claude-worker-driver.ts';
import { createFakeDriverHarness, signal } from './fixtures/fake-driver.ts';
import { collect } from './fixtures/fixture-replay.ts';

let harness: Awaited<ReturnType<typeof createFakeDriverHarness>>;

beforeEach(async () => {
    harness = await createFakeDriverHarness();
});
afterEach(async () => {
    await harness.close();
});

async function workerDriver() {
    const cwd = join(harness.root, 'checkout');
    const homeDir = join(harness.root, 'person');
    await mkdir(cwd, { recursive: true });
    await mkdir(homeDir, { recursive: true });
    const driver = createClaudeWorkerDriver({
        baseEnv: {
            CLAUDECODE: '1',
            FAKE_CLAUDE_LOG: join(harness.root, 'launches.jsonl'),
            PATH: process.env.PATH,
        },
        binaryPath: join(harness.root, 'claude'),
        cwd,
        env: { HAUS_WORKER_TOKEN: 'hwt_turn' },
        homeDir,
        modelId: null,
    });
    return { cwd, driver, homeDir };
}

test('a first turn runs a native session in the checkout as the machine user', async () => {
    const { cwd, driver, homeDir } = await workerDriver();
    const session = await driver.openSession({
        resumeFrom: undefined,
        sessionId: 'wrk_1',
        signal: signal(),
    });
    const events = await collect(
        (await session.startTurn({ prompt: 'brief', signal: signal() })).events
    );
    await session.stop();

    expect(events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : []))).toEqual([
        'echo: brief',
    ]);
    const [launch] = await harness.launches();
    expect(launch?.cwd).toBe(realpathSync(cwd));
    expect(launch?.env.HOME).toBe(homeDir);
    expect(launch?.env.CLAUDECODE).toBeNull();
    expect(launch?.env.hasHostToolToken).toBe(false);
    expect(launch?.args).toEqual([
        '--output-format',
        'stream-json',
        '--input-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--permission-mode',
        'bypassPermissions',
        '--allow-dangerously-skip-permissions',
        '--setting-sources',
        'user,project,local',
        '--allowedTools',
        'Glob,Grep',
        '--disallowedTools',
        'EnterPlanMode,ExitPlanMode,ScheduleWakeup,CronCreate,CronList,CronDelete,AskUserQuestion,Monitor,RemoteTrigger,PushNotification',
        '--session-id',
        session.sessionId,
    ]);
});

test('a later turn resumes the session it was given', async () => {
    const { driver } = await workerDriver();
    const session = await driver.openSession({
        resumeFrom: { claudeSessionId: 'native-7', runtime: 'claude-code', version: 1 },
        sessionId: 'wrk_1',
        signal: signal(),
    });
    await collect((await session.startTurn({ prompt: 'follow-up', signal: signal() })).events);
    await session.stop();

    expect(session.isResume).toBe(true);
    expect(session.sessionId).toBe('native-7');
    expect((await harness.launches())[0]?.args.slice(-2)).toEqual(['--resume', 'native-7']);
});

const asked = {
    questions: [
        {
            header: 'Database',
            multiSelect: false,
            options: [
                { description: 'The default.', label: 'Postgres' },
                { description: 'Embedded.', label: 'SQLite' },
            ],
            question: 'Which database should I use?',
        },
    ],
};

async function askingTurn(prompt: string, harnessVersion: string) {
    const cwd = join(harness.root, 'checkout');
    await mkdir(cwd, { recursive: true });
    const responses = join(harness.root, 'responses.jsonl');
    const driver = createClaudeWorkerDriver({
        baseEnv: {
            FAKE_CLAUDE_LOG: join(harness.root, 'launches.jsonl'),
            FAKE_CLAUDE_RESPONSES: responses,
            PATH: process.env.PATH,
        },
        binaryPath: join(harness.root, 'claude'),
        cwd,
        env: {},
        harnessVersion,
        homeDir: join(harness.root, 'home'),
        modelId: null,
    });
    const captured: unknown[] = [];
    const session = await driver.openSession({
        onQuestion: async (questions) => {
            captured.push(questions);
        },
        resumeFrom: undefined,
        sessionId: 'wrk_1',
        signal: signal(),
    });
    await collect((await session.startTurn({ prompt, signal: signal() })).events);
    await session.stop();
    const answers = await Bun.file(responses)
        .text()
        .catch(() => '');
    return {
        answers: answers
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line).response),
        args: (await harness.launches())[0]?.args ?? [],
        captured,
    };
}

test('an AskUserQuestion is captured once and denied with an interrupt', async () => {
    const turn = await askingTurn(`ask ${JSON.stringify(asked)}`, claudeWorkerQuestionsMinVersion);

    expect(turn.args).toContain('--permission-prompt-tool');
    expect(turn.args[turn.args.indexOf('--disallowedTools') + 1]).not.toContain('AskUserQuestion');
    expect(turn.captured).toEqual([
        [
            {
                header: 'Database',
                multiSelect: false,
                options: [
                    { description: 'The default.', label: 'Postgres' },
                    { description: 'Embedded.', label: 'SQLite' },
                ],
                question: 'Which database should I use?',
            },
        ],
    ]);
    expect(turn.answers).toEqual([{ behavior: 'deny', interrupt: true, message: askedMessage }]);
});

test('questions Haus cannot read are denied without ending the turn', async () => {
    const turn = await askingTurn('ask {"questions":[]}', claudeWorkerQuestionsMinVersion);

    expect(turn.captured).toEqual([]);
    expect(turn.answers).toHaveLength(1);
    expect(turn.answers[0].behavior).toBe('deny');
    expect(turn.answers[0].interrupt).toBeUndefined();
});

test('every other permission prompt is denied', async () => {
    const turn = await askingTurn('rm', claudeWorkerQuestionsMinVersion);

    expect(turn.captured).toEqual([]);
    expect(turn.answers).toEqual([{ behavior: 'deny', message: refusedMessage }]);
});

test('a Claude Code older than the minimum keeps the question tool off', async () => {
    const turn = await askingTurn('hello', '2.1.284');

    expect(turn.args).not.toContain('--permission-prompt-tool');
    expect(turn.args[turn.args.indexOf('--disallowedTools') + 1]).toContain('AskUserQuestion');
});
