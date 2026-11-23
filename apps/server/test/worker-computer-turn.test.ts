import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { WorkerTurnExit } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { messageDriveCitationsTable, workersTable } from '../src/postgres/schema.ts';
import { acceptWorkerTurn, planCarrierReconnect } from '../src/workers/carrier-frames.ts';
import {
    acceptComputerTurnInput,
    answerHeldWorkers,
    recordComputerTurnActivity,
    recordComputerTurnSession,
} from '../src/workers/computer-turn-frames.ts';
import { failOfflineComputerTurns } from '../src/workers/fail-offline-computer-turns.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { closeTask } from './worker-board.fixture.ts';
import {
    computerPlaceBoard,
    endTurn,
    readTurn,
    requestStop,
    setDraft,
    startComputerWorker,
} from './worker-computer-turn.fixture.ts';

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

const report = { kind: 'report' };
const rows: Array<[WorkerTurnExit, boolean, boolean, object]> = [
    ['exited', true, false, report],
    ['exited', false, true, { kind: 'stopped' }],
    ['exited', false, false, { detail: null, kind: 'failed', reason: 'no-report' }],
    [
        'crashed-before-launch',
        true,
        false,
        { detail: null, kind: 'failed', reason: 'harness-error' },
    ],
    ['uncertain', true, false, report],
    ['uncertain', false, false, { detail: null, kind: 'failed', reason: 'no-report' }],
    ['refused', true, false, { detail: null, kind: 'failed', reason: 'launch-refused' }],
    ['stopped', true, true, report],
    ['stopped', false, true, { kind: 'stopped' }],
];

test('every row of the settlement table settles its turn as specced', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const settled: object[] = [];
    for (const [exit, draft, stop] of rows) {
        const { turnId } = await startComputerWorker(connection.db, board);
        if (draft) {
            await setDraft(connection.db, turnId, `Report for ${exit}.`);
        }
        if (stop) {
            await requestStop(connection.db, board, turnId);
        }
        await endTurn(connection.db, delivery, board, { exit, turnId });
        const outcome = (await readTurn(connection.db, turnId))?.outcome;
        settled.push(outcome?.kind === 'report' ? { kind: 'report' } : (outcome ?? {}));
    }

    expect(settled).toEqual(rows.map(([, , , expected]) => expected));
});

test('a report posts with citations bound to what its push left, and a stale end changes nothing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const path = `agents/a/reports/${board.task.key}/r.md`;
    await connection.db.execute(sql`
        insert into drive_pushes (id, server_id, agent_id, worker_id, closed_at)
        values (${turnId}, ${board.seed.serverId}, ${board.seed.agentId}, ${workerId}, now())`);
    await connection.db.execute(sql`
        insert into drive_push_outcomes (server_id, push_id, author_key, request_id, operation,
            content_type, path_key, outcome)
        values (${board.seed.serverId}, ${turnId}, ${`worker:${workerId}`}, 'dp_cited_00000000',
            'put', 'text/markdown', ${path.toLowerCase()}, ${JSON.stringify({
                current: { artifact_id: 'art_pushed', revision_id: 'rev_pushed' },
                outcome: 'committed',
                path,
            })}::jsonb)`);
    await setDraft(
        connection.db,
        turnId,
        `See [it](drive://${path}) and [old](drive://haus/old.md).`
    );

    expect(
        await endTurn(connection.db, delivery, board, { attempt: 2, exit: 'exited', turnId })
    ).toBe(null);
    expect((await readTurn(connection.db, turnId))?.outcome).toBeNull();
    await endTurn(connection.db, delivery, board, {
        exit: 'exited',
        sessionId: 'session-1',
        turnId,
    });

    const turn = await readTurn(connection.db, turnId);
    const messageId = turn?.outcome?.kind === 'report' ? turn.outcome.report.messageId : null;
    const citations = await connection.db
        .select({
            artifactId: messageDriveCitationsTable.artifactId,
            path: messageDriveCitationsTable.path,
            revisionId: messageDriveCitationsTable.revisionId,
        })
        .from(messageDriveCitationsTable)
        .where(eq(messageDriveCitationsTable.messageId, messageId ?? ''))
        .orderBy(messageDriveCitationsTable.ordinal);
    expect(citations).toEqual([
        { artifactId: 'art_pushed', path, revisionId: 'rev_pushed' },
        { artifactId: null, path: 'haus/old.md', revisionId: null },
    ]);
    expect(await readWorker(workerId)).toMatchObject({ nativeSessionId: 'session-1' });
});

test('WORKER.md advances only on the current attempt, and the native session is stored once', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };
    await connection.db.execute(sql`update worker_turns
        set dispatch_attempt = 2, worker_md_revision_id = 'rev_worker_md' where id = ${turnId}`);
    const accepted = (attempt: number) =>
        acceptComputerTurnInput(connection.db, scope, {
            attempt,
            turnId,
            type: 'worker-turn-input-accepted',
            workerMdRevisionId: 'rev_worker_md',
        });

    await accepted(1);
    expect((await readWorker(workerId))?.workerMdRevisionId).toBeNull();
    await accepted(2);
    expect(await readWorker(workerId)).toMatchObject({
        status: 'running',
        workerMdRevisionId: 'rev_worker_md',
    });
    const session = (sessionId: string) =>
        recordComputerTurnSession(connection.db, scope, {
            sessionId,
            turnId,
            type: 'worker-turn-session',
        });
    await session('first');
    expect(await session('second')).toBeNull();
    expect((await readWorker(workerId))?.nativeSessionId).toBe('first');
});

test('a lost accept, then a resend, leaves the running attempt current: its frames settle the turn and advance WORKER.md', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };

    const reconnect = await planCarrierReconnect(
        connection.db,
        { id: board.seed.computerId, serverId: board.seed.serverId },
        null
    );
    expect(
        reconnect.frames.flatMap(({ frame }) =>
            frame.type === 'worker-turn-start' ? [[frame.turnId, frame.attempt]] : []
        )
    ).toEqual([[turnId, 2]]);
    await connection.db.execute(sql`update worker_turns
        set worker_md_revision_id = 'rev_worker_md' where id = ${turnId}`);
    await acceptWorkerTurn(connection.db, { ...scope, attempt: 1, turnId }, null);
    await acceptComputerTurnInput(connection.db, scope, {
        attempt: 1,
        turnId,
        type: 'worker-turn-input-accepted',
        workerMdRevisionId: 'rev_worker_md',
    });
    await setDraft(connection.db, turnId, 'Done on the first attempt.');
    await endTurn(connection.db, delivery, board, { attempt: 1, exit: 'exited', turnId });

    const turn = await readTurn(connection.db, turnId);
    expect(turn?.outcome?.kind === 'report' ? turn.outcome.report.text : turn?.outcome).toBe(
        'Done on the first attempt.'
    );
    expect(await readWorker(workerId)).toMatchObject({
        status: 'completed',
        workerMdRevisionId: 'rev_worker_md',
    });
});

test('activity updates the Worker at most once per cadence and posts nothing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };
    const activity = (at: string, summary: string) =>
        recordComputerTurnActivity(connection.db, scope, {
            at,
            summary,
            turnId,
            type: 'worker-turn-activity',
        });

    await activity('2026-11-19T10:00:00.000Z', 'Reading the tests');
    expect(await activity('2026-11-19T10:00:02.000Z', 'Too soon')).toBeNull();
    await activity('2026-11-19T10:00:06.000Z', 'Running the suite');

    expect(await readWorker(workerId)).toMatchObject({ activitySummary: 'Running the suite' });
});

test('closing a Task sends worker-close, and a held closed Worker is closed again on connect', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await endTurn(connection.db, delivery, board, { exit: 'exited', turnId });

    const closed = await closeTask(connection.db, board, delivery);

    expect(closed.workerFrames).toContainEqual({
        computerId: board.seed.computerId,
        frame: { type: 'worker-close', workerId },
    });
    const held = await answerHeldWorkers(
        connection.db,
        { computerId: board.seed.computerId, serverId: board.seed.serverId },
        { keptWorktrees: [], type: 'worker-held', workerIds: [workerId, 'wkr_gone000000000000'] }
    );
    expect(held.frames.map(({ frame }) => frame)).toEqual([
        { type: 'worker-close', workerId },
        { type: 'worker-close', workerId: 'wkr_gone000000000000' },
    ]);
});

test('a Computer turn whose Computer stays disconnected 30 minutes fails machine-offline', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId } = await startComputerWorker(connection.db, board);
    await connection.db.execute(sql`update computers
        set health = 'offline', disconnected_at = '2026-11-19T10:00:00Z'
        where id = ${board.seed.computerId}`);

    await failOfflineComputerTurns(connection.db, delivery, new Date('2026-11-19T10:29:00Z'));
    expect((await readTurn(connection.db, turnId))?.outcome).toBeNull();
    await failOfflineComputerTurns(connection.db, delivery, new Date('2026-11-19T10:30:00Z'));
    expect((await readTurn(connection.db, turnId))?.outcome).toEqual({
        detail: null,
        kind: 'failed',
        reason: 'machine-offline',
    });
});

async function readWorker(workerId: string) {
    const [worker] = await connection.db
        .select()
        .from(workersTable)
        .where(eq(workersTable.id, workerId));
    return worker;
}
