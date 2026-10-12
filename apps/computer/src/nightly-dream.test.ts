import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { settleDreamBaseline } from './harness/memory-dream.ts';
import { type NightlyDreamInput, runNightlyDreamCheck } from './nightly-dream.ts';

const runtime = makeDaemonRuntime();
let root: string;
let agentsDir: string;
let busy: Set<string>;
let sent: unknown[];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-nightly-dream-'));
    agentsDir = join(root, 'servers', 'srv_test', 'agents');
    busy = new Set();
    sent = [];
});

afterEach(async () => {
    await chmod(join(agentsDir, 'agt_b', 'workspace', 'notes'), 0o755).catch(() => undefined);
    await rm(root, { force: true, recursive: true });
});

afterAll(async () => {
    await runtime.dispose();
});

/** Local wall-clock times, since the quiet window is in this machine's local time. */
const night = new Date(2026, 9, 11, 3, 30).getTime();
const noon = new Date(2026, 9, 11, 12, 0).getTime();

async function addAgent(agentId: string, configured = true): Promise<string> {
    const agentRoot = join(agentsDir, agentId);
    await mkdir(join(agentRoot, 'workspace', 'notes'), { recursive: true });
    await writeFile(join(agentRoot, 'workspace', 'MEMORY.md'), '# Memory\n');
    if (configured) {
        await writeFile(
            join(agentRoot, 'configuration.json'),
            JSON.stringify({ missingResources: [], modelId: 'm', runtimeId: 'codex' })
        );
    }
    return agentRoot;
}

function check(now: number): Promise<string[]> {
    const input: NightlyDreamInput = {
        agentsDir,
        daemonWork: {
            agentWork: {
                activeRunId: (agentId: string) => (busy.has(agentId) ? 'run_1' : undefined),
            },
            resettingAgents: new Set(),
            retiredAgents: new Set(),
            send: (frame: unknown) => {
                sent.push(frame);
                return true;
            },
        } as unknown as NightlyDreamInput['daemonWork'],
        now: () => new Date(now),
        runtime,
    };
    return runNightlyDreamCheck(input);
}

async function change(agentRoot: string): Promise<void> {
    await writeFile(join(agentRoot, 'workspace', 'notes', 'lesson.md'), `${Math.random()}`);
}

test('a changed, idle Agent is asked to dream inside the quiet window only', async () => {
    const agentRoot = await addAgent('agt_a');
    expect(await check(night - 24 * 3_600_000)).toEqual([]); // first look: baseline
    await change(agentRoot);

    expect(await check(noon)).toEqual([]);
    expect(sent).toEqual([]);
    expect(await check(night)).toEqual(['agt_a']);
    expect(sent).toEqual([
        { agentId: 'agt_a', localDate: '2026-10-11', type: 'agent-dream-request' },
    ]);
});

test('unchanged memory and unconfigured Agents are never asked', async () => {
    await addAgent('agt_a');
    const stray = await addAgent('agt_z', false);
    expect(await check(night)).toEqual([]);
    await change(stray);
    expect(await check(night + 60_000)).toEqual([]);
});

test('a busy Agent is skipped, then asked on the next tick once idle', async () => {
    const agentRoot = await addAgent('agt_a');
    await check(night - 24 * 3_600_000);
    await change(agentRoot);

    busy.add('agt_a');
    expect(await check(night)).toEqual([]);
    busy.delete('agt_a');
    expect(await check(night + 600_000)).toEqual(['agt_a']);
});

test('after a dream settles, its own edits never ask again, and the 20h guard holds', async () => {
    const agentRoot = await addAgent('agt_a');
    await check(night - 24 * 3_600_000);
    await change(agentRoot);
    expect(await check(night)).toEqual(['agt_a']);

    // The dream turn edits memory, then completes and settles the baseline.
    await change(agentRoot);
    await settleDreamBaseline({
        agentRoot,
        dream: { createdAt: new Date(night).toISOString(), id: 'dream:agt_a:2026-10-11' },
        now: night + 60_000,
        runtime,
        workspaceDir: join(agentRoot, 'workspace'),
    });
    expect(await check(night + 120_000)).toEqual([]);
    // A later change inside the guard waits; the next night it is due.
    await change(agentRoot);
    expect(await check(night + 3_600_000)).toEqual([]);
    expect(await check(night + 24 * 3_600_000)).toEqual(['agt_a']);
});

test("one Agent's failure is logged and never stops the others or the loop", async () => {
    const first = await addAgent('agt_a');
    const broken = await addAgent('agt_b');
    await check(night - 24 * 3_600_000);
    await change(first);
    await change(broken);
    await chmod(join(broken, 'workspace', 'notes'), 0o000);

    expect(await check(night)).toEqual(['agt_a']);
});
