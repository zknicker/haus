import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema, type DriveConflictAttention } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { maxAgentChainTurns } from '../src/agent-delivery/chain-budget.ts';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import * as store from '../src/agent-delivery/store.ts';
import { queueDriveConflict } from '../src/drive/conflict-item.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentRunTriggersTable,
} from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { settledTurn } from './settled-turn-fixture.ts';

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

function conflictOf(pushId: string, writer: DriveConflictAttention['writer']) {
    const attention: DriveConflictAttention = {
        files: [
            {
                copyPath: 'agents/ada/notes/launch.conflict-ada.md',
                currentAuthorHandle: 'tiny',
                currentRevisionId: 'rev_launch_head',
                outcome: 'kept_both',
                path: 'agents/ada/notes/launch.md',
                reason: 'same_lines',
            },
            {
                copyPath: null,
                currentAuthorHandle: 'tiny',
                currentRevisionId: 'rev_plan_head',
                outcome: 'kept_edit',
                path: 'haus/old-plan.md',
                reason: 'edit_over_delete',
            },
            {
                copyPath: null,
                currentAuthorHandle: null,
                currentRevisionId: null,
                outcome: 'refused',
                path: 'agents/tiny/notes.md',
                reason: 'FORBIDDEN',
            },
        ],
        id: `drive-conflict:${pushId}`,
        pushId,
        writer,
    };
    return attention;
}

const queue = (delivery: AgentDelivery, seed: Seed, attention: DriveConflictAttention) =>
    queueDriveConflict(connection.db, delivery, {
        attention,
        recipientAgentId: attention.writer.agentId,
        serverId: seed.serverId,
    });

async function conflictRows(agentId: string) {
    return await connection.db
        .select({
            chatId: agentInboxTable.chatId,
            dedupeKey: agentInboxTable.dedupeKey,
            mentioned: agentInboxTable.mentioned,
            runId: agentInboxTable.runId,
            state: agentInboxTable.state,
        })
        .from(agentInboxTable)
        .where(
            and(eq(agentInboxTable.agentId, agentId), eq(agentInboxTable.source, 'drive_conflict'))
        );
}

async function setChain(seed: Seed, turns: number) {
    await store.ensureDeliveryState(connection.db, seed);
    await connection.db
        .update(agentDeliveryTable)
        .set({ agentChainAdvancedAt: new Date(), agentChainTurns: turns })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
}

async function turnsOf(seed: Seed) {
    return (await store.readDeliveryState(connection.db, seed.agentId))?.agentChainTurns;
}

test('one push queues one item that wakes an idle Agent as its own chatless run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const attention = conflictOf('run_push_idle', { agentId: seed.agentId, type: 'agent' });

    expect(await queue(delivery, seed, attention)).toEqual({
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    await queue(delivery, seed, attention);
    expect(await conflictRows(seed.agentId)).toEqual([
        {
            chatId: null,
            dedupeKey: 'drive-conflict:run_push_idle',
            mentioned: true,
            runId: null,
            state: 'queued',
        },
    ]);

    const start = await wake();
    expect(start).toMatchObject({
        agentId: seed.agentId,
        chatId: null,
        drainItemIds: [],
        inbox: [],
        inboxDelivery: 'concrete',
        totalPending: 0,
        type: 'start',
        unreadElsewhere: [],
        warmDrainItemIds: [],
    });
    expect(start?.driveConflict).toEqual(attention);
    expect(start).not.toHaveProperty('taskAssignments');
    expect(start).not.toHaveProperty('subagentWake');
    expect(agentCommandSchema.safeParse(start).success).toBe(true);

    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });
    expect(transport.framesOfType('start').at(-1)).toEqual(start as never);

    const runId = start?.runId ?? '';
    const [trigger] = await connection.db
        .select({
            chatId: agentRunTriggersTable.chatId,
            source: agentRunTriggersTable.source,
            workId: agentRunTriggersTable.workId,
        })
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.runId, runId));
    expect(trigger).toEqual({
        chatId: null,
        source: 'drive_conflict',
        workId: 'drive-conflict:run_push_idle',
    });

    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, runId));
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['seen']);

    await queue(delivery, seed, attention);
    expect(await conflictRows(seed.agentId)).toHaveLength(1);
    expect(transport.framesOfType('start')).toHaveLength(2);
});

test('two pushes never coalesce: each runs alone', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const writer = { agentId: seed.agentId, type: 'agent' as const };
    await queue(delivery, seed, conflictOf('run_push_first', writer));
    await queue(delivery, seed, conflictOf('run_push_second', writer));

    const first = await wake();
    expect(first?.driveConflict?.pushId).toBe('run_push_first');
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, first?.runId ?? ''));
    const second = transport.framesOfType('start').at(-1);
    expect(second?.driveConflict?.pushId).toBe('run_push_second');
    expect(second?.runId).not.toBe(first?.runId);
});

test("a Worker's push reaches its Agent, and no one else", async () => {
    const seed = await seedAgent(connection.db);
    const other = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const attention = conflictOf('run_push_worker', {
        agentId: seed.agentId,
        taskId: 'tsk_worker_push',
        type: 'worker',
        workerId: 'wkr_one',
    });

    await expect(
        queueDriveConflict(connection.db, delivery, {
            attention,
            recipientAgentId: other.agentId,
            serverId: other.serverId,
        })
    ).rejects.toThrow("Drive conflict drive-conflict:run_push_worker belongs to the writer's");
    expect(await conflictRows(other.agentId)).toEqual([]);

    await queue(delivery, seed, attention);
    const start = await wake();
    expect(start?.driveConflict?.writer).toEqual({
        agentId: seed.agentId,
        taskId: 'tsk_worker_push',
        type: 'worker',
        workerId: 'wkr_one',
    });
});

test('a busy Agent gets no notice, then the item as its next run', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    const dmId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const busyRunId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: busyRunId });

    await queue(
        delivery,
        seed,
        conflictOf('run_push_busy', { agentId: seed.agentId, type: 'agent' })
    );
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(transport.framesOfType('notice')).toEqual([]);

    const humanId = await deliverHuman(connection.db, delivery, seed, { chatId: seed.channelId });
    const notice = transport.framesOfType('notice').at(-1);
    expect(notice?.inbox.map((item) => item.id)).toEqual([dmId, humanId]);
    expect(notice?.totalPending).toBe(2);
    expect(JSON.stringify(notice)).not.toContain('run_push_busy');

    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, busyRunId));
    const next = transport.framesOfType('start').at(-1);
    expect(next?.runId).not.toBe(busyRunId);
    expect(next?.driveConflict?.pushId).toBe('run_push_busy');
    expect(next?.chatId).toBeNull();
});

test('a failed run with no output requeues the item', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_failed', { agentId: seed.agentId, type: 'agent' })
    );
    const start = await wake();
    const runId = start?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['served']);

    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, runId),
        failureKind: 'transport',
        status: 'failed',
    });
    expect(await conflictRows(seed.agentId)).toEqual([
        {
            chatId: null,
            dedupeKey: 'drive-conflict:run_push_failed',
            mentioned: true,
            runId: null,
            state: 'queued',
        },
    ]);
});

test('the item spends the automation chain', async () => {
    const seed = await seedAgent(connection.db);
    await setChain(seed, 3);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_chain', { agentId: seed.agentId, type: 'agent' })
    );
    const start = await wake();
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, start?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(4);
});

test('at the ceiling the item waits queued until a person speaks, then runs first', async () => {
    const seed = await seedAgent(connection.db);
    await setChain(seed, maxAgentChainTurns);
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    await queue(
        delivery,
        seed,
        conflictOf('run_push_ceiling', { agentId: seed.agentId, type: 'agent' })
    );

    expect(await wake()).toBeUndefined();
    await delivery.dispatchAgent(seed.agentId, seed.serverId);
    expect(transport.framesOfType('start')).toEqual([]);
    expect((await conflictRows(seed.agentId)).map((row) => row.state)).toEqual(['queued']);

    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const [conflictRun] = transport.framesOfType('start');
    expect(conflictRun?.driveConflict?.pushId).toBe('run_push_ceiling');
    await delivery.onTurnSettled(seed.computerId, settledTurn(seed, conflictRun?.runId ?? ''));
    expect(await turnsOf(seed)).toBe(1);

    const humanRun = transport.framesOfType('start').at(-1);
    expect(humanRun?.chatId).toBe(seed.dmChatId);
    await delivery.onTurnSettled(seed.computerId, {
        ...settledTurn(seed, humanRun?.runId ?? ''),
        outputProduced: true,
    });
    expect(await turnsOf(seed)).toBe(0);
});
