import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStartCommand } from '../agent-command-frames.ts';
import { pruneCheckpoints } from './heartbeat-checkpoints.ts';
import {
    clearQuietRunNote,
    quietRunLine,
    readQuietRunNote,
    recordHeartbeatSettled,
} from './heartbeat-note.ts';
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

test('a daytime heartbeat input names the recipe, cutoff, digest, checkpoint, and commands', async () => {
    const text = await composeHeartbeatInput(heartbeat, root);
    expect(text).toContain('[Haus daytime heartbeat]');
    expect(text).toContain(
        'haus manual get recipes/technique/heartbeat --intent "daytime heartbeat" --reason "Haus started my heartbeat"'
    );
    expect(text).toContain('Post nothing in any chat.');
    expect(text).toContain('2026-10-20T08:07:00.000Z');
    expect(text).toContain(
        '- #product (channel) "product": 5 new since seq 120; read with `haus message read --target #product --after 120`; speakers @maya, @sam; addressed you; last speaker @maya'
    );
    expect(text).toContain('and 3 more');
    expect(text).toContain('No checkpoint yet — this is your first heartbeat.');
    expect(text).toContain('`haus reminder list`');
    expect(text).toContain('`haus lead list`');
});

test('a nightly heartbeat names the nightly recipe intent and the latest checkpoint', async () => {
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
    expect(text).toContain('--intent "nightly heartbeat"');
    expect(text).toContain('No earlier cutoff');
    expect(text).toContain('no conversation you took part in moved');
    expect(text).toContain('heartbeat/checkpoints/2026-10-20/10-05.md');
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

test('the quiet-run note counts settled heartbeats, renders one line, and clears', async () => {
    expect(await readQuietRunNote(root)).toBeNull();
    await recordHeartbeatSettled(root, {
        latestCheckpoint: 'heartbeat/checkpoints/a.md',
        reported: false,
    });
    await recordHeartbeatSettled(root, { latestCheckpoint: null, reported: true });
    const note = await readQuietRunNote(root);
    expect(note).toEqual({ count: 2, latestCheckpoint: 'heartbeat/checkpoints/a.md', reported: 1 });
    expect(note && quietRunLine(note)).toBe(
        'Your heartbeat ran 2× since your last turn (1 reported); latest checkpoint: heartbeat/checkpoints/a.md.'
    );
    await clearQuietRunNote(root);
    expect(await readQuietRunNote(root)).toBeNull();
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
