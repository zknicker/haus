import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, chatMessagesTable, messageClaimsTable } from '../src/postgres/schema.ts';
import { offlineDelivery, type Seed } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { settledTurn } from './settled-turn-fixture.ts';
import { assignNewTask, seedTaskBoard, taskInboxRows } from './task-delivery-fixture.ts';

/** When a requeued item leaves the queue undelivered (ADR 0051 decision 5, ADR 0062). */
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

const seedBoard = () => seedTaskBoard(connection.db);

test('a failed run forgets its Task assignment: a Task has no assignee to hand it back to', async () => {
    const board = await seedBoard();
    const { seed } = board;
    const { delivery, runner, transport } = offlineDelivery(connection.db, seed);
    await assignNewTask(connection.db, delivery, board, 'Queued before Tasks lost assignees');
    transport.online.add(seed.computerId);
    runner.attach(seed.agentId);
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect((await taskInboxRows(connection.db, seed)).map((row) => row.state)).toEqual([
        'accepted',
    ]);

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runner.starts()[0]?.runId ?? ''),
        status: 'failed',
    });
    expect(await taskInboxRows(connection.db, seed)).toEqual([]);
});

test('a failed run forgets a claim assignment whose claim is gone, and keeps a live one', async () => {
    const claimAssignments = async (seed: Seed) =>
        await connection.db
            .select({ dedupeKey: agentInboxTable.dedupeKey, state: agentInboxTable.state })
            .from(agentInboxTable)
            .where(eq(agentInboxTable.agentId, seed.agentId));
    const failRun = async (seed: Seed, dedupeKey: string) => {
        const { delivery, runner, transport } = offlineDelivery(connection.db, seed);
        transport.online.add(seed.computerId);
        runner.attach(seed.agentId);
        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.channelId,
            content: '[Haus claim assignment claim=#1 target=#product] Work',
            dedupeKey,
            mentioned: true,
            serverId: seed.serverId,
            source: 'claim_assignment',
        });
        await delivery.onTurnSettled(seed.computerId, {
            ...settledTurn(seed, runner.starts()[0]?.runId ?? ''),
            status: 'failed',
        });
    };

    const { seed: migrated } = await seedBoard();
    await failRun(migrated, 'claim-assign:msg_migrated_away:1');
    expect(await claimAssignments(migrated)).toEqual([]);

    const { seed: live } = await seedBoard();
    const messageId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: live.userId,
        chatId: live.channelId,
        content: 'Work',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: live.serverId,
    });
    await connection.db.insert(messageClaimsTable).values({
        assigneeAgentId: live.agentId,
        chatId: live.channelId,
        createdByUserId: live.userId,
        messageId,
        number: 1,
        origin: 'claimed',
        serverId: live.serverId,
        status: 'todo',
    });
    await failRun(live, `claim-assign:${messageId}:1`);
    expect(await claimAssignments(live)).toEqual([
        { dedupeKey: `claim-assign:${messageId}:1`, state: 'queued' },
    ]);
});
