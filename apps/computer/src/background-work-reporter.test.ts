import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackgroundWorkReporter, wakeHoldMs } from './background-work-reporter.ts';

let agentsDir: string;
let agentRoot: string;
let frames: Record<string, unknown>[];
let holds: [string, number][];
let closing: boolean;

beforeEach(async () => {
    agentsDir = await mkdtemp(join(tmpdir(), 'haus-background-work-'));
    agentRoot = join(agentsDir, 'agt_one');
    await mkdir(join(agentRoot, 'runtime'), { recursive: true });
    await writeFile(
        join(agentRoot, 'session.json'),
        JSON.stringify({
            effectiveModel: { modelId: 'claude-haiku-4-5', runtimeId: 'claude-code' },
            generation: 3,
            resumeState: null,
            runtimeSessionId: null,
        })
    );
    frames = [];
    holds = [];
    closing = false;
});

afterEach(async () => {
    await rm(agentsDir, { force: true, recursive: true });
});

const reporter = () =>
    createBackgroundWorkReporter({
        agentsDir,
        closing: () => closing,
        holdForWake: (agentId, ms) => holds.push([agentId, ms]),
        onError: (error) => {
            throw error;
        },
        send: (frame) => {
            frames.push(frame as Record<string, unknown>);
            return true;
        },
    });

const markers = async () =>
    (await readdir(join(agentRoot, 'runtime'))).filter((name) => name === 'background-work.json');

const settled = () => Bun.sleep(20);

test('a turn Claude Code starts on its own asks the Server for a wake and holds the Agent’s calls', async () => {
    reporter().wake(agentRoot);
    await settled();
    expect(holds).toEqual([['agt_one', wakeHoldMs]]);
    expect(frames).toEqual([
        {
            agentId: 'agt_one',
            reason: 'finished',
            sessionGeneration: 3,
            type: 'agent-subagent-wake',
            wakeId: expect.stringMatching(/^wake_/u),
        },
    ]);
});

test('work a process took with it wakes the Agent as stopped; deliberate ends wake nobody', async () => {
    const work = reporter();
    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    await settled();
    expect(await markers()).toEqual(['background-work.json']);

    work.lost(agentRoot, true);
    await settled();
    expect(frames).toEqual([]);
    expect(await markers()).toEqual([]);

    work.changed(agentRoot, { subagents: 1, tasks: 2 });
    await settled();
    work.lost(agentRoot, false);
    await settled();
    expect(frames).toMatchObject([{ reason: 'stopped', sessionGeneration: 3 }]);
    expect(await markers()).toEqual([]);
});

test('work lost to a shutdown is reported once by the next daemon', async () => {
    const before = reporter();
    before.changed(agentRoot, { subagents: 2, tasks: 2 });
    await settled();
    closing = true;
    before.lost(agentRoot, false);
    await settled();
    expect(frames).toEqual([]);
    expect(await markers()).toEqual(['background-work.json']);

    const after = reporter();
    await after.recoverLostWork();
    await after.recoverLostWork();
    expect(frames).toMatchObject([{ agentId: 'agt_one', reason: 'stopped' }]);
    expect(await markers()).toEqual([]);
});

test('finished background work clears its marker', async () => {
    const work = reporter();
    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    await settled();
    work.changed(agentRoot, { subagents: 0, tasks: 0 });
    await settled();
    expect(await markers()).toEqual([]);
    await work.recoverLostWork();
    expect(frames).toEqual([]);
});
