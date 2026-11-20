import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { removeServerComputer } from '../src/computers/remove-computer.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    chatMessagesTable,
    computersTable,
    workerTurnsTable,
} from '../src/postgres/schema.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { WorkerCarrierRemovedError } from '../src/workers/errors.ts';
import { sendPersonFollowUp } from '../src/workers/send-person-follow-up.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import {
    readTurns,
    seedWorkerBoard,
    setReadyPlaces,
    startOn,
    type WorkerBoard,
} from './worker-board.fixture.ts';

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

test('removing a Computer fails the turns it carried machine-removed, reports each, and dispatches the next', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { seed } = board;
    const { delivery } = offlineDelivery(connection.db, seed);
    await connection.db.execute(sql`
        insert into worker_place_limits (server_id, place, worker_limit)
        values (${seed.serverId}, 'cursor', 1)
    `);
    const carrierId = createOpaqueId('cmp');
    await connection.db.insert(computersTable).values({
        attachedByUserId: seed.userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: carrierId,
        serverId: seed.serverId,
    });
    await setReadyPlaces(connection.db, seed.serverId, seed.computerId, []);
    await setReadyPlaces(connection.db, seed.serverId, carrierId, ['cursor']);
    const carried = (await startOn(connection.db, board)).receipt.worker;
    const followUp = await sendAgentFollowUp(connection.db, board.runner, {
        interrupt: false,
        nonce: 'carried-follow-up',
        text: 'Also update the changelog.',
        workerId: carried.id,
    });
    await setReadyPlaces(connection.db, seed.serverId, seed.computerId, ['cursor']);
    const waiting = await startOn(connection.db, board);
    expect([carried.carrierComputerId, waiting.receipt.state]).toEqual([carrierId, 'queued']);

    const removed = await removeServerComputer(
        connection.db,
        delivery,
        { id: seed.userId },
        {
            computerId: carrierId,
            confirmation: 'REMOVE',
            serverId: seed.serverId,
        }
    );

    const machineRemoved = { detail: null, kind: 'failed', reason: 'machine-removed' };
    expect((await readTurns(connection.db, carried.id)).map((turn) => turn.outcome)).toEqual([
        machineRemoved,
        machineRemoved,
    ]);
    const carriedTurns = [carried.turns[0]?.turnId, followUp.receipt.turnId];
    expect(await reportItems(seed.agentId)).toEqual(
        carriedTurns.map((turnId) => `worker-report:${turnId}`).sort()
    );
    expect(removed.workers.wakes).toEqual([
        { agentId: seed.agentId, serverId: seed.serverId },
        { agentId: seed.agentId, serverId: seed.serverId },
    ]);
    expect(
        removed.workers.frames.map(({ computerId, frame }) => [
            computerId,
            frame.type,
            'turnId' in frame && frame.turnId,
        ])
    ).toEqual([[seed.computerId, 'worker-turn-start', waiting.receipt.worker.turns[0]?.turnId]]);
    expect(
        await connection.db
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(eq(computersTable.id, carrierId))
    ).toEqual([]);
});

test('a Worker whose carrier was removed refuses follow-ups from its Agent and from people', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const workerId = await startOnRemovedCarrier(board, delivery);
    const member = await findUserById(connection.db, board.seed.userId);
    if (!member) {
        throw new Error('The seeded person is missing.');
    }

    const fromAgent = sendAgentFollowUp(connection.db, board.runner, {
        interrupt: false,
        nonce: 'after-removal',
        text: 'Keep going.',
        workerId,
    });
    const fromPerson = sendPersonFollowUp(
        connection.db,
        member,
        { nonce: 'card-after-removal', serverId: board.seed.serverId, text: 'Keep going.', workerId },
        delivery
    );

    await expect(fromAgent).rejects.toBeInstanceOf(WorkerCarrierRemovedError);
    await expect(fromPerson).rejects.toBeInstanceOf(WorkerCarrierRemovedError);
    expect((await readTurns(connection.db, workerId)).length).toBe(1);
    expect(
        await connection.db
            .select({ id: chatMessagesTable.id })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.chatId, board.task.chatId),
                    eq(chatMessagesTable.bodyKind, 'worker-follow-up')
                )
            )
    ).toEqual([]);
});

test('dispatch never sends a turn to a removed carrier', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const workerId = await startOnRemovedCarrier(board, delivery);
    const orphanId = createOpaqueId('wkt');
    await connection.db.insert(workerTurnsTable).values({
        id: orphanId,
        input: [
            {
                at: new Date().toISOString(),
                author: { id: board.seed.agentId, kind: 'agent' },
                kind: 'follow-up',
                messageId: null,
                text: 'Queued before the removal reached this Worker.',
            },
        ],
        serverId: board.seed.serverId,
        workerId,
    });
    await setReadyPlaces(connection.db, board.seed.serverId, board.seed.computerId, ['cursor']);

    const other = await startOn(connection.db, board);

    expect(
        other.effects.frames.map(({ computerId, frame }) => [
            computerId,
            'turnId' in frame && frame.turnId,
        ])
    ).toEqual([[board.seed.computerId, other.receipt.worker.turns[0]?.turnId]]);
    const orphan = (await readTurns(connection.db, workerId)).find((turn) => turn.id === orphanId);
    expect(orphan?.dispatchedAt).toBeNull();
});

async function startOnRemovedCarrier(
    board: WorkerBoard,
    delivery: ReturnType<typeof offlineDelivery>['delivery']
) {
    const { seed } = board;
    const carrierId = createOpaqueId('cmp');
    await connection.db.insert(computersTable).values({
        attachedByUserId: seed.userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: carrierId,
        serverId: seed.serverId,
    });
    await setReadyPlaces(connection.db, seed.serverId, seed.computerId, []);
    await setReadyPlaces(connection.db, seed.serverId, carrierId, ['cursor']);
    const { worker } = (await startOn(connection.db, board)).receipt;
    await removeServerComputer(
        connection.db,
        delivery,
        { id: seed.userId },
        { computerId: carrierId, confirmation: 'REMOVE', serverId: seed.serverId }
    );
    return worker.id;
}

async function reportItems(agentId: string) {
    const rows = await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, agentId), eq(agentInboxTable.source, 'worker_report'))
        );
    return rows.map((row) => row.dedupeKey).sort();
}
