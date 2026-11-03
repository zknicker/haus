import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { type HeartbeatScheduleInput, runHeartbeatSchedule } from './heartbeat-schedule.ts';
import { agentSlotOffsetMinutes, dueHeartbeatSlot } from './heartbeat-slots.ts';

const runtime = makeDaemonRuntime();
let root: string;
let agentsDir: string;
let resetting: Set<string>;
let sendSucceeds: boolean;
let sent: Record<string, unknown>[];
/** This process's in-memory record; a fresh Map is a Computer restart. */
let handled: Map<string, string>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-heartbeat-schedule-'));
    agentsDir = join(root, 'servers', 'srv_test', 'agents');
    resetting = new Set();
    sendSucceeds = true;
    sent = [];
    handled = new Map();
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

afterAll(async () => {
    await runtime.dispose();
});

/** Local wall-clock times, since slots are in this machine's local time. */
const at = (hour: number, min = 0, day = 11) => new Date(2026, 9, day, hour, min).getTime();

async function addAgent(agentId: string, configured = true): Promise<void> {
    const agentRoot = join(agentsDir, agentId);
    await mkdir(join(agentRoot, 'workspace'), { recursive: true });
    if (configured) {
        await writeFile(
            join(agentRoot, 'configuration.json'),
            JSON.stringify({ missingResources: [], modelId: 'm', runtimeId: 'codex' })
        );
    }
}

function input(now: number): HeartbeatScheduleInput {
    return {
        agentsDir,
        daemonWork: {
            resettingAgents: resetting,
            retiredAgents: new Set(),
            send: (frame: unknown) => {
                if (sendSucceeds) {
                    sent.push(frame as Record<string, unknown>);
                }
                return sendSucceeds;
            },
        } as unknown as HeartbeatScheduleInput['daemonWork'],
        handled,
        now: () => new Date(now),
        runtime,
    };
}

async function tick(now: number): Promise<string[]> {
    const records = await runHeartbeatSchedule(input(now));
    return records.map((record) =>
        [record.agentId, record.kind, record.slot, record.outcome, record.reason]
            .filter(Boolean)
            .join(':')
    );
}

test('offsets are stable per Agent and inside the hour', () => {
    const offset = agentSlotOffsetMinutes('agt_a');
    expect(offset).toBe(agentSlotOffsetMinutes('agt_a'));
    for (const id of ['agt_a', 'agt_b', 'agt_c', 'agt_d', 'agt_e']) {
        expect(agentSlotOffsetMinutes(id)).toBeGreaterThanOrEqual(0);
        expect(agentSlotOffsetMinutes(id)).toBeLessThan(60);
    }
    expect(
        new Set(['agt_a', 'agt_b', 'agt_c', 'agt_d', 'agt_e'].map(agentSlotOffsetMinutes)).size
    ).toBeGreaterThan(1);
});

test('a daytime slot is due from its start plus the offset until the next slot begins', () => {
    const offset = agentSlotOffsetMinutes('agt_a');
    expect(offset).toBeGreaterThan(0);
    // Before start plus offset nothing is due; the previous slot's span has ended.
    expect(dueHeartbeatSlot('agt_a', new Date(at(11, offset - 1)))).toBeNull();
    expect(dueHeartbeatSlot('agt_a', new Date(at(10, 59)))).toEqual({
        kind: 'daytime',
        localDate: '2026-10-11',
        slot: '08:00',
    });
    expect(dueHeartbeatSlot('agt_a', new Date(at(11, offset)))).toEqual({
        kind: 'daytime',
        localDate: '2026-10-11',
        slot: '11:00',
    });
    expect(dueHeartbeatSlot('agt_a', new Date(at(13, 59)))?.slot).toBe('11:00');
    expect(dueHeartbeatSlot('agt_a', new Date(at(22, 59)))?.slot).toBe('20:00');
    expect(dueHeartbeatSlot('agt_a', new Date(at(23, 0)))).toBeNull();
});

test('the quiet hours carry only the nightly window', () => {
    expect(dueHeartbeatSlot('agt_a', new Date(at(1)))).toBeNull();
    expect(dueHeartbeatSlot('agt_a', new Date(at(2, 59)))).toBeNull();
    expect(dueHeartbeatSlot('agt_a', new Date(at(3)))).toEqual({
        kind: 'nightly',
        localDate: '2026-10-11',
        slot: '03:00',
    });
    expect(dueHeartbeatSlot('agt_a', new Date(at(4, 59)))?.kind).toBe('nightly');
    expect(dueHeartbeatSlot('agt_a', new Date(at(5)))).toBeNull();
    expect(dueHeartbeatSlot('agt_a', new Date(at(7, 59)))).toBeNull();
});

test('each Agent is asked once per slot, and a missed slot is not made up', async () => {
    await addAgent('agt_a');
    const offset = agentSlotOffsetMinutes('agt_a');
    expect(await tick(at(11, 0))).toEqual([]);
    expect(await tick(at(11, offset))).toEqual(['agt_a:daytime:11:00:requested']);
    expect(await tick(at(11, offset + 10))).toEqual([]);
    expect(await tick(at(13, 50))).toEqual([]);

    // The 14:00 slot is a fresh ask.
    expect(await tick(at(14, offset))).toEqual(['agt_a:daytime:14:00:requested']);
    // A Computer asleep through 17:00 does not ask for it at 20:00.
    expect(await tick(at(20, offset))).toEqual(['agt_a:daytime:20:00:requested']);
    expect(sent.map((frame) => frame.slot)).not.toContain('17:00');
});

test('the request frame carries kind, local date, and slot', async () => {
    await addAgent('agt_a');
    await tick(at(3, 5));
    expect(sent).toEqual([
        {
            agentId: 'agt_a',
            kind: 'nightly',
            localDate: '2026-10-11',
            slot: '03:00',
            type: 'agent-heartbeat-request',
        },
    ]);
    expect(await tick(at(4, 30))).toEqual([]);
});

test('a restart never re-asks for a slot already sent', async () => {
    await addAgent('agt_a');
    expect(await tick(at(3))).toEqual(['agt_a:nightly:03:00:requested']);
    handled = new Map();
    expect(await tick(at(3, 20))).toEqual([]);
    expect(sent).toHaveLength(1);
    // The next night is a new slot.
    expect(await tick(at(3, 0, 12))).toEqual(['agt_a:nightly:03:00:requested']);
});

test('an unsent request is retried next tick', async () => {
    await addAgent('agt_a');
    sendSucceeds = false;
    expect(await tick(at(3))).toEqual([]);
    sendSucceeds = true;
    expect(await tick(at(3, 10))).toEqual(['agt_a:nightly:03:00:requested']);
});

test('unconfigured and resetting Agents are skipped with a reason', async () => {
    await addAgent('agt_a');
    await addAgent('agt_r');
    await addAgent('agt_z', false);
    resetting.add('agt_r');
    expect(await tick(at(3))).toEqual([
        'agt_a:nightly:03:00:requested',
        'agt_r:nightly:03:00:skipped:resetting',
        'agt_z:nightly:03:00:skipped:not-configured',
    ]);
    expect(await tick(at(3, 10))).toEqual([]);
});

test('dot-directories and stray files under the agents dir are not Agents', async () => {
    await addAgent('agt_a');
    await mkdir(join(agentsDir, '.harness-bridge-prewarm', 'workspace'), { recursive: true });
    await writeFile(join(agentsDir, 'stray.json'), '{}');
    expect(await tick(at(3))).toEqual(['agt_a:nightly:03:00:requested']);
});

test('each check exports one haus.heartbeat.check span through the Server relay', async () => {
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
        await runHeartbeatSchedule({ ...input(at(3)), runtime: relayed });
    } finally {
        await relayed.dispose();
        server.stop(true);
    }
    const body = bodies.join('');
    for (const text of ['haus.heartbeat.check', 'agt_a', '2026-10-11', 'nightly', 'requested']) {
        expect(body).toContain(text);
    }
});
