import { afterEach, beforeEach, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClaudeWorkerDriver } from './claude-worker-driver.ts';
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
