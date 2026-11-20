import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema, agentInboxItemSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { noticeReceipt, parseNoticeCommand } from '../../computer/src/agent-command-frames.ts';
import { enqueuePullRequestWakes } from '../src/github/pull-request-wake.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { settledTurn } from './settled-turn-fixture.ts';
import { observe, seedWorkerBoard, startOn, type WorkerBoard } from './worker-board.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const pullRequestUrl = 'https://github.com/haus/haus/pull/77';

test('a busy Agent hears a count of one Task reports, then gets the reports in its next run', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, board.seed);
    transport.online.add(board.seed.computerId);
    await deliverHuman(connection.db, delivery, board.seed, { chatId: board.seed.dmChatId });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: board.seed.agentId, runId });

    const first = await finishWorker(board, delivery, 'First is done.');
    const second = await finishWorker(board, delivery, 'Second is done.');
    await delivery.dispatchAgent(board.seed.agentId, board.seed.serverId);

    const notice = transport.framesOfType('notice').at(-1);
    expect(agentCommandSchema.safeParse(notice).success).toBe(true);
    expect(notice?.inbox.filter((item) => item.workerReport)).toEqual([]);
    expect(notice?.workerReports).toEqual({
        ids: [`worker-report:${first}`, `worker-report:${second}`],
        taskKey: board.task.key,
        total: 2,
    });
    expect(JSON.stringify(notice)).not.toContain('First is done.');
    const parsed = parseNoticeCommand(notice);
    const receipt = parsed ? noticeReceipt(parsed) : null;
    expect(receipt).toEqual({
        runId,
        workIds: [
            ...(notice?.inbox.map((item) => item.id) ?? []),
            `worker-report:${first}`,
            `worker-report:${second}`,
        ],
    });
    await delivery.onNoticeAck({
        agentId: board.seed.agentId,
        ...(receipt ?? { runId, workIds: [] }),
    });
    expect(await reportNoticeRuns(board)).toEqual([
        { dedupeKey: `worker-report:${first}`, noticeRunId: runId },
        { dedupeKey: `worker-report:${second}`, noticeRunId: runId },
    ]);
    const notices = transport.framesOfType('notice').length;
    await delivery.dispatchAgent(board.seed.agentId, board.seed.serverId);
    expect(transport.framesOfType('notice')).toHaveLength(notices);

    await delivery.onTurnSettled(board.seed.computerId, settledTurn(board.seed, runId));
    const next = transport.framesOfType('start').at(-1);
    expect(next?.chatId).toBe(board.task.chatId);
    expect(next?.inbox.map((item) => item.workerReport?.turnId)).toEqual([first, second]);
    await delivery.onAck({ agentId: board.seed.agentId, runId: next?.runId ?? '' });
    await delivery.onTurnSettled(board.seed.computerId, settledTurn(board.seed, next?.runId ?? ''));
    expect(await itemStates(board, 'worker_report')).toEqual([
        { dedupeKey: `worker-report:${first}`, state: 'seen' },
        { dedupeKey: `worker-report:${second}`, state: 'seen' },
    ]);
});

test('a stalled turn queues one worker_stall item per window, in its Task', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    const stalled = (observedAt: string) =>
        observe(connection.db, delivery, board, {
            observedAt,
            stallCode: 'followup-auto-interrupt-failed',
            status: 'running',
            turnId,
            workerId: worker.id,
        });

    await stalled('2026-11-19T12:00:00.000Z');
    await stalled('2026-11-19T12:05:00.000Z');

    const frame = await wake();
    const [item] = (frame?.inbox ?? []).map((entry) => agentInboxItemSchema.parse(entry));
    expect(frame?.chatId).toBe(board.task.chatId);
    expect(item?.worker).toMatchObject({
        notice: 'stall',
        place: { kind: 'cursor' },
        stallCode: 'followup-auto-interrupt-failed',
        turnId,
        workerId: worker.id,
    });
    expect(await itemStates(board, 'worker_stall')).toHaveLength(1);
});

test('a pull request change wakes the Agent of a settled Worker that reported it, once per head', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, board.seed);
    const turnId = await finishWorker(board, delivery, `Opened ${pullRequestUrl}`, [
        pullRequestUrl,
    ]);
    await connection.db
        .update(agentInboxTable)
        .set({ state: 'seen' })
        .where(eq(agentInboxTable.agentId, board.seed.agentId));
    const reading = {
        headSha: 'abcdef1234567',
        number: 77,
        repository: 'haus/haus',
        serverId: board.seed.serverId,
        url: pullRequestUrl,
    };

    for (const _ of [1, 2]) {
        await connection.db.transaction(async (tx) => {
            await enqueuePullRequestWakes(tx, delivery, {
                reading,
                transitions: ['ready_for_review'],
            });
        });
    }

    const frame = await wake();
    const [item] = (frame?.inbox ?? []).map((entry) => agentInboxItemSchema.parse(entry));
    expect(frame?.chatId).toBe(board.task.chatId);
    expect(item?.worker).toMatchObject({
        notice: 'pull_request',
        place: { kind: 'cursor' },
        pullRequestChange: { change: 'ready_for_review', url: pullRequestUrl },
        turnId,
    });
    expect(await itemStates(board, 'pull_request')).toHaveLength(1);
});

async function finishWorker(
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    text: string,
    pullRequestUrls: string[] = []
) {
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls, text },
        status: 'completed',
        turnId,
        workerId: worker.id,
    });
    return turnId;
}

async function reportNoticeRuns(board: WorkerBoard) {
    return await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey, noticeRunId: agentInboxTable.noticeRunId })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, board.seed.agentId),
                eq(agentInboxTable.source, 'worker_report')
            )
        )
        .orderBy(agentInboxTable.createdAt);
}

async function itemStates(board: WorkerBoard, source: string) {
    return await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, board.seed.agentId), eq(agentInboxTable.source, source))
        )
        .orderBy(agentInboxTable.createdAt);
}
