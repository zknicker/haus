import { afterEach, beforeEach, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    decideStart,
    noticePath,
    purgeServerPartition,
    type RunMarker,
    readRunMarker,
    writePendingNotice,
    writeRunMarker,
} from './delivery.ts';
import type { AgentTurnFrame } from './launch.ts';
import { parseNoticeCommand, parseServerDeleteCommand } from './launch.ts';

let dataRoot: string;
const serverId = 'srv_deliverytest0000';

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-delivery-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

const summary: AgentTurnFrame = {
    activity: { operations: [] },
    agentId: 'agt_x',
    endedAt: '2026-07-27T00:00:01.000Z',
    messageCount: 1,
    modelId: 'gpt-test',
    outputProduced: true,
    runId: 'run_x',
    runtimeId: 'codex',
    startedAt: '2026-07-27T00:00:00.000Z',
    status: 'completed',
    summary: 'done',
    tokenUsage: null,
    type: 'turn',
    visibleMessages: [],
};

test('a fresh run with no marker launches', () => {
    expect(decideStart(null)).toEqual({ kind: 'run' });
});

test('a settled run replays its stored summary instead of re-running', () => {
    const marker: RunMarker = { status: 'settled', summary };
    expect(decideStart(marker)).toEqual({ kind: 'replay', summary });
});

test('an accepted-but-unsettled run replays because acceptance is not model-seen proof', () => {
    expect(decideStart({ status: 'accepted' })).toEqual({ kind: 'run' });
});

test('run markers survive a Computer restart and drive idempotent replay', async () => {
    await writeRunMarker(dataRoot, {
        marker: { status: 'accepted' },
        runId: 'run_x',
        serverId,
    });
    await writeRunMarker(dataRoot, {
        marker: { status: 'settled', summary },
        runId: 'run_x',
        serverId,
    });

    // A new process re-reads the durable marker from disk; a redelivered start
    // frame resolves to a replay, so the model never sees the run twice.
    const marker = await readRunMarker(dataRoot, { runId: 'run_x' }, serverId);
    expect(marker).toEqual({ status: 'settled', summary });
    expect(decideStart(marker)).toEqual({ kind: 'replay', summary });
});

test('a missing marker reads as null', async () => {
    expect(await readRunMarker(dataRoot, { runId: 'run_absent' }, serverId)).toBeNull();
});

test('an interrupted accepted-only run stays replayable until it settles', async () => {
    await writeRunMarker(dataRoot, { marker: { status: 'accepted' }, runId: 'run_x', serverId });
    expect(decideStart(await readRunMarker(dataRoot, { runId: 'run_x' }, serverId))).toEqual({
        kind: 'run',
    });

    // Recovery reports a failed, interrupted turn and settles the marker, so a
    // later redelivery replays that terminal result instead of recovering again.
    const interrupted: AgentTurnFrame = {
        ...summary,
        outputProduced: true,
        status: 'failed',
    };
    await writeRunMarker(dataRoot, {
        marker: { status: 'settled', summary: interrupted },
        runId: 'run_x',
        serverId,
    });
    expect(decideStart(await readRunMarker(dataRoot, { runId: 'run_x' }, serverId))).toEqual({
        kind: 'replay',
        summary: interrupted,
    });
});

test('a pending notice carries durable envelopes but persists only model-safe notice text', async () => {
    const inbox = [inboxItem()];
    const notice = parseNoticeCommand({
        agentId: 'agt_x',
        inbox,
        runId: 'run_x',
        totalPending: 3,
        type: 'notice',
    });
    expect(notice).toEqual({
        agentId: 'agt_x',
        inbox,
        runId: 'run_x',
        totalPending: 3,
        type: 'notice',
        unreadElsewhere: [],
    });

    await writePendingNotice(dataRoot, {
        agentId: 'agt_x',
        notice: '[Haus inbox notice:\\n#general pending: 1 message(s)\\n]',
        serverId,
    });
    const written = JSON.parse(
        await readFile(noticePath(dataRoot, { agentId: 'agt_x', serverId }), 'utf8')
    );
    expect(written).toEqual({
        notice: '[Haus inbox notice:\\n#general pending: 1 message(s)\\n]',
    });
});

test('a Server deletion command is exact and content-free', () => {
    expect(parseServerDeleteCommand({ type: 'server-delete' })).toEqual({
        type: 'server-delete',
    });
    expect(parseServerDeleteCommand({ serverId, type: 'server-delete' })).toBeNull();
});

test('Server cleanup waits for local writers before removing their partition', async () => {
    let releaseWriter: () => void = () => {};
    const writer = new Promise<void>((resolve) => {
        releaseWriter = resolve;
    }).then(() => mkdir(join(dataRoot, 'servers', serverId), { recursive: true }));
    const purge = purgeServerPartition(dataRoot, serverId, [writer]);

    releaseWriter();
    await purge;
    await expect(lstat(join(dataRoot, 'servers', serverId))).rejects.toMatchObject({
        code: 'ENOENT',
    });
});

test('parseNoticeCommand fails closed on a malformed frame', () => {
    expect(parseNoticeCommand({ agentId: 'agt_x', runId: 'run_x', type: 'notice' })).toBeNull();
    expect(parseNoticeCommand({ inbox: [inboxItem()], runId: 'run_x', type: 'notice' })).toBeNull();
    expect(parseNoticeCommand({ type: 'start' })).toBeNull();
});

function inboxItem() {
    return {
        chatId: 'cht_x',
        content: 'secret body',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'msg_x',
        senderHandle: 'operator',
        senderType: 'human' as const,
        sequence: 1,
        target: '#general',
    };
}
