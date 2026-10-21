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
    // Every queued file write lands before the directory goes.
    await Promise.all(reporters.splice(0).map((work) => work.settled(agentRoot)));
    await rm(agentsDir, { force: true, recursive: true });
});

let online: boolean;
let fenced: string[];
const reporters: ReturnType<typeof createBackgroundWorkReporter>[] = [];

const reporter = () => {
    const work = createReporter();
    reporters.push(work);
    return work;
};

const createReporter = () =>
    createBackgroundWorkReporter({
        agentsDir,
        closing: () => closing,
        fence: (root) => {
            fenced.push(root);
            return Promise.resolve();
        },
        holdForWake: (agentId, ms) => holds.push([agentId, ms]),
        onError: (error) => {
            throw error;
        },
        send: (frame) => {
            if (online) {
                frames.push(frame as Record<string, unknown>);
            }
            return online;
        },
    });

beforeEach(() => {
    online = true;
    fenced = [];
});

const pendingWake = async () =>
    (await readdir(join(agentRoot, 'runtime'))).includes('subagent-wake.json');

const result = (wakeId: unknown, outcome: 'accepted' | 'refused') => ({
    agentId: 'agt_one',
    outcome,
    type: 'agent-subagent-wake-result' as const,
    wakeId: String(wakeId),
});

const markers = async () =>
    (await readdir(join(agentRoot, 'runtime'))).filter((name) => name === 'background-work.json');

const settled = () => Bun.sleep(20);
const wakes = () => frames.filter((frame) => frame.type === 'agent-subagent-wake');
const counts = () => frames.filter((frame) => frame.type === 'agent-background-work');

test('each Agent’s running sub-agents reach the Server on change and on every connect', async () => {
    await mkdir(join(agentsDir, 'agt_two'));
    const work = reporter();
    work.changed(agentRoot, { subagents: 2, tasks: 3 });
    // A shell that changes the task count but not the sub-agent count says nothing new.
    work.changed(agentRoot, { subagents: 2, tasks: 2 });
    work.lost(agentRoot, true);
    await work.reportCounts();
    expect(counts()).toEqual([
        { agents: [{ agentId: 'agt_one', subagents: 2 }], type: 'agent-background-work' },
        { agents: [{ agentId: 'agt_one', subagents: 0 }], type: 'agent-background-work' },
        {
            agents: [
                { agentId: 'agt_one', subagents: 0 },
                { agentId: 'agt_two', subagents: 0 },
            ],
            type: 'agent-background-work',
        },
    ]);
});

test('a turn Claude Code starts on its own asks the Server for a wake and holds the Agent’s calls', async () => {
    reporter().wake(agentRoot);
    await settled();
    expect(holds).toEqual([['agt_one', wakeHoldMs]]);
    expect(wakes()).toEqual([
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
    expect(wakes()).toEqual([]);
    expect(await markers()).toEqual([]);

    work.changed(agentRoot, { subagents: 1, tasks: 2 });
    await settled();
    work.lost(agentRoot, false);
    await settled();
    expect(wakes()).toMatchObject([{ reason: 'stopped', sessionGeneration: 3 }]);
    expect(await markers()).toEqual([]);
});

test('work lost to a shutdown is reported once by the next daemon', async () => {
    const before = reporter();
    before.changed(agentRoot, { subagents: 2, tasks: 2 });
    await settled();
    closing = true;
    before.lost(agentRoot, false);
    await settled();
    expect(wakes()).toEqual([]);
    expect(await markers()).toEqual(['background-work.json']);

    const after = reporter();
    await after.recoverLostWork();
    await after.recoverLostWork();
    expect(wakes()).toMatchObject([{ agentId: 'agt_one', reason: 'stopped' }]);
    expect(await markers()).toEqual([]);
});

test('marker writes land in call order, so a stale count never outlives a later end', async () => {
    const work = reporter();
    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    work.changed(agentRoot, { subagents: 0, tasks: 0 });
    await work.settled(agentRoot);
    expect(await markers()).toEqual([]);

    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    work.lost(agentRoot, true);
    await work.settled(agentRoot);
    expect(await markers()).toEqual([]);
    await work.recoverLostWork();
    expect(wakes()).toEqual([]);
});

test('a wake sent between connections is resent on reconnect until the Server answers', async () => {
    const work = reporter();
    online = false;
    work.wake(agentRoot);
    await work.settled(agentRoot);
    expect(wakes()).toEqual([]);
    expect(await pendingWake()).toBe(true);

    online = true;
    await work.resendPendingWakes();
    await work.resendPendingWakes();
    const [first, second] = wakes();
    expect(first).toMatchObject({ agentId: 'agt_one', reason: 'finished' });
    expect(second?.wakeId).toBe(first?.wakeId);

    work.onWakeResult(result(first?.wakeId, 'accepted'));
    await work.settled(agentRoot);
    expect(await pendingWake()).toBe(false);
    await work.resendPendingWakes();
    expect(wakes()).toHaveLength(2);
    expect(fenced).toEqual([]);
});

test('a refused wake fences the turn it was for, and only that one', async () => {
    const work = reporter();
    work.wake(agentRoot);
    await work.settled(agentRoot);
    const [stale] = wakes();
    work.wake(agentRoot);
    await work.settled(agentRoot);
    const [, current] = wakes();

    work.onWakeResult(result(stale?.wakeId, 'refused'));
    await work.settled(agentRoot);
    expect(fenced).toEqual([]);
    expect(await pendingWake()).toBe(true);

    work.onWakeResult(result(current?.wakeId, 'refused'));
    await work.settled(agentRoot);
    expect(fenced).toEqual([agentRoot]);
    expect(await pendingWake()).toBe(false);
});

test('a non-wake run that adopts the turn retires its wake', async () => {
    const work = reporter();
    online = false;
    work.wake(agentRoot);
    await work.settled(agentRoot);
    online = true;
    work.absorbed(agentRoot);
    await work.settled(agentRoot);
    expect(await pendingWake()).toBe(false);
    const retires = frames.filter((frame) => frame.type === 'agent-subagent-wake-retire');
    expect(retires).toEqual([
        {
            agentId: 'agt_one',
            type: 'agent-subagent-wake-retire',
            wakeId: expect.stringMatching(/^wake_/u),
        },
    ]);
    await work.resendPendingWakes();
    expect(wakes()).toEqual([]);
});

test('a deliberate end retires pending wakes and lost-work markers', async () => {
    const work = reporter();
    online = false;
    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    work.wake(agentRoot);
    await work.retire(agentRoot);
    expect(await pendingWake()).toBe(false);
    expect(await markers()).toEqual([]);
    online = true;
    await work.resendPendingWakes();
    await work.recoverLostWork();
    expect(wakes()).toEqual([]);
});

test('finished background work clears its marker', async () => {
    const work = reporter();
    work.changed(agentRoot, { subagents: 1, tasks: 1 });
    await settled();
    work.changed(agentRoot, { subagents: 0, tasks: 0 });
    await settled();
    expect(await markers()).toEqual([]);
    await work.recoverLostWork();
    expect(wakes()).toEqual([]);
});
