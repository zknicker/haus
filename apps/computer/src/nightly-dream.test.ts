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
let resetting: Set<string>;
let sendSucceeds: boolean;
let sent: unknown[];
/** This process's in-memory record; a fresh Map is a Computer restart. */
let checked: Map<string, string>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-nightly-dream-'));
    agentsDir = join(root, 'servers', 'srv_test', 'agents');
    resetting = new Set();
    sendSucceeds = true;
    sent = [];
    checked = new Map();
});

afterEach(async () => {
    await chmod(join(agentsDir, 'agt_b', 'workspace', 'notes'), 0o755).catch(() => undefined);
    await rm(root, { force: true, recursive: true });
});

afterAll(async () => {
    await runtime.dispose();
});

const hour = 3_600_000;
const day = 24 * hour;
/** Local wall-clock times, since the quiet window is in this machine's local time. */
const night = new Date(2026, 9, 11, 3, 0).getTime();
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

function input(now: number): NightlyDreamInput {
    return {
        agentsDir,
        checked,
        daemonWork: {
            resettingAgents: resetting,
            retiredAgents: new Set(),
            send: (frame: unknown) => {
                if (sendSucceeds) {
                    sent.push(frame);
                }
                return sendSucceeds;
            },
        } as unknown as NightlyDreamInput['daemonWork'],
        now: () => new Date(now),
        runtime,
    };
}

/** One tick: each finished check as `agentId:outcome`. */
async function tick(now: number): Promise<string[]> {
    const records = await runNightlyDreamCheck(input(now));
    return records.map((record) =>
        [record.agentId, record.outcome, record.reason].filter(Boolean).join(':')
    );
}

async function change(agentRoot: string): Promise<void> {
    await writeFile(join(agentRoot, 'workspace', 'notes', 'lesson.md'), `${Math.random()}`);
}

test('each Agent is checked once per night: the first look baselines, the next night requests', async () => {
    const agentRoot = await addAgent('agt_a');
    expect(await tick(night)).toEqual(['agt_a:baselined']);
    await change(agentRoot);
    // Later ticks the same night never check again, even after a change.
    expect(await tick(night + 600_000)).toEqual([]);
    expect(await tick(night + hour)).toEqual([]);
    expect(sent).toEqual([]);

    expect(await tick(night + day)).toEqual(['agt_a:requested']);
    expect(sent).toEqual([
        { agentId: 'agt_a', localDate: '2026-10-12', type: 'agent-dream-request' },
    ]);
    expect(await tick(night + day + 600_000)).toEqual([]);
    expect(sent).toHaveLength(1);
});

test('a machine that wakes late inside the window checks then; outside it the night is skipped', async () => {
    const agentRoot = await addAgent('agt_a');
    expect(await tick(noon)).toEqual([]);
    expect(await tick(night + 2 * hour)).toEqual([]); // 05:00: window closed
    expect(await tick(night + hour + 20 * 60_000)).toEqual(['agt_a:baselined']); // 04:20
    await change(agentRoot);
    // The next night it sleeps through the window; nothing is asked after 05:00.
    expect(await tick(night + day + 2 * hour + 60_000)).toEqual([]);
    expect(await tick(night + 2 * day + 10 * 60_000)).toEqual(['agt_a:requested']);
});

test('a restart never re-checks a night already checked', async () => {
    const agentRoot = await addAgent('agt_a');
    await tick(night);
    await change(agentRoot);
    expect(await tick(night + day)).toEqual(['agt_a:requested']);

    checked = new Map();
    expect(await tick(night + day + 600_000)).toEqual([]);
    expect(sent).toHaveLength(1);
});

test("an unsent request is retried next tick, then counts as that night's check", async () => {
    const agentRoot = await addAgent('agt_a');
    await tick(night);
    await change(agentRoot);
    sendSucceeds = false;
    expect(await tick(night + day)).toEqual([]);
    sendSucceeds = true;
    expect(await tick(night + day + 600_000)).toEqual(['agt_a:requested']);
});

test('unchanged memory is not due; unconfigured and resetting Agents are skipped', async () => {
    await addAgent('agt_a');
    await addAgent('agt_r');
    const stray = await addAgent('agt_z', false);
    resetting.add('agt_r');
    expect(await tick(night)).toEqual([
        'agt_a:baselined',
        'agt_r:skipped:resetting',
        'agt_z:skipped:not-configured',
    ]);
    await change(stray);
    expect(await tick(night + day)).toEqual([
        'agt_a:not-due',
        'agt_r:skipped:resetting',
        'agt_z:skipped:not-configured',
    ]);
    expect(sent).toEqual([]);
});

test('dot-directories and stray files under the agents dir are not Agents', async () => {
    await addAgent('agt_a');
    await mkdir(join(agentsDir, '.harness-bridge-prewarm', 'workspace'), { recursive: true });
    await writeFile(join(agentsDir, 'stray.json'), '{}');
    expect(await tick(night)).toEqual(['agt_a:baselined']);
});

test('after a dream settles, its own edits never ask again, and the 20h guard holds', async () => {
    const agentRoot = await addAgent('agt_a');
    await tick(night - day);
    await change(agentRoot);
    expect(await tick(night)).toEqual(['agt_a:requested']);

    // The dream turn edits memory, then completes and settles the baseline.
    await change(agentRoot);
    await settleDreamBaseline({
        agentRoot,
        dream: { createdAt: new Date(night).toISOString(), id: 'dream:agt_a:2026-10-11' },
        now: night + 18 * hour,
        runtime,
        workspaceDir: join(agentRoot, 'workspace'),
    });
    // A dream that ran late keeps the next night inside the guard.
    await change(agentRoot);
    expect(await tick(night + day)).toEqual(['agt_a:not-due']);
    expect(await tick(night + 2 * day)).toEqual(['agt_a:requested']);
});

test('each check exports one haus.dream.check span through the Server relay', async () => {
    const bodies: string[] = [];
    const server = Bun.serve({
        async fetch(request) {
            if (new URL(request.url).pathname.endsWith('/traces')) {
                bodies.push(Buffer.from(await request.arrayBuffer()).toString('latin1'));
            }
            return new Response(null, { status: 200 });
        },
        port: 0,
    });
    const relayed = makeDaemonRuntime({
        telemetryRelay: { credential: 'computer-secret', serverOrigin: server.url.origin },
    });
    try {
        await addAgent('agt_a');
        await runNightlyDreamCheck({ ...input(night), runtime: relayed });
    } finally {
        await relayed.dispose();
        server.stop(true);
    }
    const body = bodies.join('');
    for (const text of [
        'haus.dream.check',
        'agt_a',
        '2026-10-11',
        'baselined',
        'haus.memory.bytes',
    ]) {
        expect(body).toContain(text);
    }
});

// Root reads through a 0o000 directory, so the injected failure needs an unprivileged user.
test.skipIf(process.getuid?.() === 0)(
    "one Agent's failure is logged and never stops the others or the loop",
    async () => {
        const first = await addAgent('agt_a');
        const broken = await addAgent('agt_b');
        await tick(night - day);
        await change(first);
        await change(broken);
        await chmod(join(broken, 'workspace', 'notes'), 0o000);

        expect(await tick(night)).toEqual(['agt_a:requested']);
    }
);
