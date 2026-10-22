import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStartCommand } from '../agent-command-frames.ts';
import { pruneCheckpoints } from './heartbeat-checkpoints.ts';
import { composeHeartbeatInput } from './heartbeat-prompt.ts';
import { composeTurnPrompt, type TurnDelivery, turnDeliveryOf } from './turn-prompt.ts';

let root: string;
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-heartbeat-input-'));
});
afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

const heartbeat = {
    connections: ['Etsy', 'Linear'],
    createdAt: '2026-10-20T10:05:00.000Z',
    digest: {
        entries: [
            {
                addressed: true,
                afterSequence: 120,
                chatId: 'cht_1',
                kind: 'channel' as const,
                lastSpeaker: '@maya',
                messageCount: 5,
                speakers: ['@maya', '@sam'],
                target: '#product',
                title: 'product',
            },
        ],
        more: 3,
    },
    id: 'heartbeat:agt_test:2026-10-20:10:00',
    kind: 'daytime' as const,
    leads: [{ agentHandle: 'blippy', id: 'led_1', topic: 'Why the Etsy payout was short' }],
    reminders: [{ fireAt: '2026-10-21T09:00:00.000Z', id: 'rem_1', title: 'Check payout' }],
    since: '2026-10-20T08:07:00.000Z',
};

const startFrame = {
    agentId: 'agt_test',
    chatId: null,
    drainItemIds: [],
    heartbeat,
    inbox: [],
    inboxDelivery: 'concrete',
    modelId: 'm',
    runId: 'run_hb',
    runtimeId: 'codex',
    sessionGeneration: 2,
    totalPending: 0,
    type: 'start',
    unreadElsewhere: [],
    warmDrainItemIds: [],
};

const report = {
    createdAt: '2026-10-20T10:40:00.000Z',
    heartbeatKind: 'daytime' as const,
    heartbeatRunId: 'run_hb',
    id: 'heartbeat-report:run_hb',
    text: 'Three new 2-star reviews mention shipping.',
};

function delivery(overrides: Partial<TurnDelivery> = {}): TurnDelivery {
    return {
        agentId: 'agt_test',
        dataRoot: '/tmp/unused',
        drainItemIds: [],
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        runId: 'run_report',
        serverId: 'srv_test',
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        ...overrides,
    };
}

test('heartbeat and report frames parse chatless, and only those frames may', () => {
    const command = parseStartCommand(startFrame);
    expect(command).toMatchObject({ chatId: null, heartbeat });
    expect(command && turnDeliveryOf(command).heartbeat).toEqual(heartbeat);

    const reportCommand = parseStartCommand({
        ...startFrame,
        heartbeat: undefined,
        heartbeatReport: report,
    });
    expect(reportCommand).toMatchObject({ chatId: null, heartbeatReport: report });

    expect(parseStartCommand({ ...startFrame, chatId: 'cht_1' })).toBeNull();
    expect(parseStartCommand({ ...startFrame, inboxDelivery: 'notice' })).toBeNull();
    expect(parseStartCommand({ ...startFrame, drainItemIds: ['msg_1'] })).toBeNull();
    expect(parseStartCommand({ ...startFrame, heartbeat: { id: 'x' } })).toBeNull();
    expect(parseStartCommand({ ...startFrame, heartbeatReport: report })).toBeNull();
    expect(
        parseStartCommand({ ...startFrame, chatId: 'cht_1', heartbeat: undefined })?.chatId
    ).toBe('cht_1');
});

async function writeCheckpoint(text: string) {
    const dir = join(root, 'heartbeat', 'checkpoints', '2026-10-20');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '08-07.md'), text);
}

test('a daytime heartbeat input carries what the run would fetch, and the recipe only for detail', async () => {
    await writeCheckpoint('Reported: quiet. Checked Etsy payouts.');
    const text = await composeHeartbeatInput(heartbeat, root);
    expect(text).toContain('[Haus daytime heartbeat]');
    expect(text).toContain(
        'fetch the recipe (`haus manual get recipes/technique/heartbeat --intent "daytime heartbeat" --reason "Haus started my heartbeat"`) only if you need detail'
    );
    expect(text).not.toContain('Read the full recipe first');
    expect(text).toContain('so do not fetch them again');
    // A bare "post nothing" read as "no report" in a live run (heartbeat-surfaces-new-signal).
    expect(text).toContain(
        'Post nothing in any chat; the one `haus heartbeat report` below is not a post.'
    );
    expect(text).toContain(
        'Latest checkpoint (heartbeat/checkpoints/2026-10-20/08-07.md), already read for you:'
    );
    expect(text).toContain('Reported: quiet. Checked Etsy payouts.');
    expect(text).toContain('- led_1 @blippy: Why the Etsy payout was short');
    expect(text).toContain('- rem_1 "Check payout" fires 2026-10-21T09:00:00.000Z');
    expect(text).toContain('Connections you can call with `execute`: Etsy, Linear.');
    expect(text).toContain('connection names, not tool names');
    expect(text).toContain('1. Catch up:');
    expect(text).toContain('6. Checkpoint:');
    expect(text).toContain('Do not read back what you wrote.');
    expect(text).not.toContain('recipe steps 7–10');
    expect(text).toContain('2026-10-20T08:07:00.000Z');
    expect(text).toContain(
        '- #product (channel) "product": 5 new since seq 120; read with `haus message read --target #product --after 120`; speakers @maya, @sam; addressed you; last speaker @maya'
    );
    expect(text).toContain('and 3 more');
});

test('an empty first heartbeat says so instead of listing', async () => {
    const text = await composeHeartbeatInput(
        { ...heartbeat, connections: [], leads: [], reminders: [] },
        root
    );
    expect(text).toContain('No checkpoint yet: this is your first heartbeat.');
    expect(text).toContain('Open leads: none.');
    expect(text).toContain('Your open reminders: none.');
    expect(text).toContain('Connections: none granted.');
});

test('a list at its limit names the command that shows the rest', async () => {
    const leads = Array.from({ length: 10 }, (_, index) => ({
        agentHandle: 'blippy',
        id: `led_${index}`,
        topic: `topic ${index}`,
    }));
    const text = await composeHeartbeatInput({ ...heartbeat, leads }, root);
    expect(text).toContain('Open leads (first 10; `haus lead list` shows all):');
    expect(text).not.toContain('Your open reminders (first');
});

test('a long checkpoint is cut at 4 KB with a note, never pasted whole', async () => {
    await writeCheckpoint(`${'a'.repeat(5000)}TAIL`);
    const text = await composeHeartbeatInput(heartbeat, root);
    expect(text).toContain('cut at 4096 bytes, read the file for the rest');
    expect(text).toContain('a'.repeat(4096));
    expect(text).not.toContain('a'.repeat(4097));
    expect(text).not.toContain('TAIL');
});

test('a nightly heartbeat reads the full recipe, does the nightly steps, and shows the latest checkpoint', async () => {
    const dir = join(root, 'heartbeat', 'checkpoints', '2026-10-20');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '08-07.md'), 'old');
    await writeFile(join(dir, '10-05.md'), 'new');
    await utimes(join(dir, '08-07.md'), new Date(1000), new Date(1000));
    const text = await composeHeartbeatInput(
        { ...heartbeat, digest: { entries: [], more: 0 }, kind: 'nightly', since: null },
        root
    );
    expect(text).toContain('[Haus nightly heartbeat]');
    expect(text).toContain('Read the full recipe first, its nightly section matters');
    expect(text).toContain('--intent "nightly heartbeat"');
    expect(text).toContain('recipe steps 7–10');
    expect(text).toContain('No earlier cutoff');
    expect(text).toContain('no conversation you took part in moved');
    expect(text).toContain('heartbeat/checkpoints/2026-10-20/10-05.md');
    expect(text).toContain('\nnew\n');
});

test('a report run hands the main session the Agent’s own report to decide on', () => {
    const prompt = composeTurnPrompt(delivery({ heartbeatReport: report }), {
        isColdStart: false,
        sessionGeneration: 2,
    });
    expect(prompt.drained).toEqual([]);
    expect(prompt.turnContent).toContain(
        '[Haus heartbeat report] Your own heartbeat (run run_hb) reported:'
    );
    expect(prompt.turnContent).toContain(report.text);
    expect(prompt.turnContent).toContain('Between 22:00 and 08:00, schedule a morning reminder');
});

test('a nightly heartbeat report never posts: it becomes a morning reminder', () => {
    const prompt = composeTurnPrompt(
        delivery({ heartbeatReport: { ...report, heartbeatKind: 'nightly' } }),
        { isColdStart: false, sessionGeneration: 2 }
    );
    expect(prompt.turnContent).toContain('came from your nightly heartbeat, so post nothing now');
    expect(prompt.turnContent).not.toContain('post where it belongs');
});

test('retention deletes checkpoints and daily files older than 14 days and nothing else', async () => {
    const workspace = join(root, 'workspace');
    const checkpoints = join(workspace, 'heartbeat', 'checkpoints');
    const daily = join(workspace, 'heartbeat', 'daily');
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-19']) {
        await mkdir(join(checkpoints, day), { recursive: true });
        await writeFile(join(checkpoints, day, '10-00.md'), day);
    }
    await mkdir(join(checkpoints, 'scratch'), { recursive: true });
    await mkdir(daily, { recursive: true });
    await writeFile(join(daily, '2026-10-05.md'), 'old');
    await writeFile(join(daily, '2026-10-06.md'), 'edge');
    await writeFile(join(daily, 'notes.md'), 'mine');
    await writeFile(join(workspace, 'MEMORY.md'), 'memory');
    await mkdir(join(workspace, 'notes'), { recursive: true });
    await writeFile(join(workspace, 'notes', '2026-01-01.md'), 'a note');

    await pruneCheckpoints(workspace, new Date(2026, 9, 20, 12));

    const { readdir } = await import('node:fs/promises');
    expect((await readdir(checkpoints)).sort()).toEqual(['2026-10-06', '2026-10-19', 'scratch']);
    expect((await readdir(daily)).sort()).toEqual(['2026-10-06.md', 'notes.md']);
    expect(await readdir(join(workspace, 'notes'))).toEqual(['2026-01-01.md']);
    expect(await Bun.file(join(workspace, 'MEMORY.md')).text()).toBe('memory');
});
