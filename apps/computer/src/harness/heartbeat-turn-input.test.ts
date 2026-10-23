import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStartCommand } from '../agent-command-frames.ts';
import { pruneCheckpoints } from './heartbeat-checkpoints.ts';
import { composeHeartbeatInput, composeHeartbeatReportInput } from './heartbeat-prompt.ts';
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
        'A `haus heartbeat report` is not a post: send at most one, only when you found something worth reporting; staying quiet is the usual outcome, and a quiet run sends no report.'
    );
    expect(text).toContain(
        'Latest checkpoint (heartbeat/checkpoints/2026-10-20/08-07.md), already read for you:'
    );
    expect(text).toContain('Reported: quiet. Checked Etsy payouts.');
    expect(text).toContain('- led_1 @blippy: Why the Etsy payout was short');
    expect(text).toContain('- rem_1 "Check payout" fires 2026-10-21T09:00:00.000Z');
    expect(text).toContain('Connections you can call with `execute`: Etsy, Linear.');
    expect(text).toContain('connection names, not tool names');
    // Codex code mode lists `execute` as `mcp__…__execute` beside its own `tools.*` globals;
    // runs that searched their tool list for the connection name or bare `execute` gave up.
    expect(text).toContain('inside `execute` code, `tools.search` each one');
    expect(text).toContain('ending in `__execute`');
    // Another Agent's open lead leaked into an unrelated run and became its report.
    expect(text).toContain(
        "a listed lead is held by the Agent named; leave another Agent's lead to it."
    );
    expect(text).toContain('1. Catch up:');
    expect(text).toContain('the asker has heard nothing until your main session replies there');
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
    expect(prompt.turnContent).toMatch(/It is \d\d:\d\d here/);
});

const local = (hour: number, minute: number) => new Date(2026, 9, 20, hour, minute);

test('a daytime report outside quiet hours leaves the decision to the Agent', () => {
    const text = composeHeartbeatReportInput(report, { now: local(14, 5), quietHours: 'on' });
    expect(text).toContain(
        'It is 14:05 here. You decide whether anyone should hear this: post where it belongs, or do nothing.'
    );
    expect(text).not.toContain('quiet hours');
});

test('a daytime report inside quiet hours says to post nothing and schedule a morning reminder', () => {
    for (const now of [local(23, 40), local(22, 0), local(7, 59), local(0, 0)]) {
        const text = composeHeartbeatReportInput(report, { now, quietHours: 'on' });
        expect(text).toContain(
            'inside quiet hours (22:00–08:00): post nothing now; schedule a morning reminder anchored to the message it concerns'
        );
        expect(text).not.toContain('post where it belongs');
    }
    expect(
        composeHeartbeatReportInput(report, { now: local(8, 0), quietHours: 'on' })
    ).not.toContain('quiet hours');
    expect(
        composeHeartbeatReportInput(report, { now: local(21, 59), quietHours: 'on' })
    ).not.toContain('quiet hours');
    expect(composeHeartbeatReportInput(report, { now: local(23, 40), quietHours: 'on' })).toContain(
        'It is 23:40 here, inside quiet hours'
    );
});

test('with quiet hours off a night-time daytime report still takes the daytime branch', () => {
    const text = composeHeartbeatReportInput(report, { now: local(23, 40), quietHours: 'off' });
    expect(text).toContain('It is 23:40 here. You decide whether anyone should hear this');
    expect(text).not.toContain('quiet hours');
});

test('a nightly report is unchanged by the clock or the switch', () => {
    const nightly = { ...report, heartbeatKind: 'nightly' as const };
    const texts = [local(14, 5), local(23, 40)].flatMap((now) =>
        (['on', 'off'] as const).map((quietHours) =>
            composeHeartbeatReportInput(nightly, { now, quietHours })
        )
    );
    for (const text of texts) {
        expect(text).toContain('came from your nightly heartbeat, so post nothing now');
        expect(text).not.toContain('It is ');
    }
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
