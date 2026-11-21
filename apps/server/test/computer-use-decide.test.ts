import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCommandSchema, type ComputerUseDecision } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import {
    deleteExpiredComputerUseRequests,
    openComputerUseRequest,
} from '../src/computer-use/computer-use-store.ts';
import {
    ComputerUseRequestDecidedError,
    decideComputerUse,
} from '../src/computer-use/decide-computer-use.ts';
import { ComputerSetupDeniedError } from '../src/computers/service.ts';
import { setComputerUse } from '../src/computers/set-computer-use.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    computersTable,
    computerUseRequestsTable,
    serverMembershipsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { addChannel, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

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

test('allow records the decision and delivers one computer_use item that wakes the Agent in that chat', async () => {
    const { seed, requestId } = await seedRequest();
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const text =
        'Ada Lovelace allowed computer use on Studio in this chat. Next: run the desktop command again.';

    await decide(delivery, seed, requestId, 'allow');

    expect(await readRequest(requestId)).toMatchObject({
        decidedByUserId: seed.userId,
        standing: false,
        state: 'allowed',
    });
    expect(await inboxRows(seed)).toEqual([
        {
            chatId: seed.channelId,
            content: text,
            dedupeKey: `computer-use:${requestId}`,
            source: 'computer_use',
        },
    ]);
    const start = await wake();
    expect(start).toMatchObject({
        agentId: seed.agentId,
        chatId: seed.channelId,
        inboxDelivery: 'concrete',
        type: 'start',
    });
    expect(start?.inbox).toEqual([
        expect.objectContaining({
            chatId: seed.channelId,
            content: text,
            senderHandle: 'haus',
            senderType: 'system',
        }),
    ]);
    expect(agentCommandSchema.safeParse(start).success).toBe(true);
    await expect(decide(delivery, seed, requestId, 'deny')).rejects.toBeInstanceOf(
        ComputerUseRequestDecidedError
    );
    expect(await inboxRows(seed)).toHaveLength(1);
});

test('always allows with standing and sets the Device to always in the same decision', async () => {
    const { seed, requestId } = await seedRequest();
    const { delivery } = offlineDelivery(connection.db, seed);

    await decide(delivery, seed, requestId, 'always');

    expect(await readRequest(requestId)).toMatchObject({ standing: true, state: 'allowed' });
    expect(await readAccess(seed)).toBe('always');
    expect((await inboxRows(seed)).map((row) => row.content)).toEqual([
        'Ada Lovelace always allowed computer use on Studio. Next: run the desktop command again.',
    ]);
});

test('deny lifts a wake pause, and a later act in that chat can open a new request', async () => {
    const { seed, requestId } = await seedRequest();
    const { delivery } = offlineDelivery(connection.db, seed);
    await connection.db.insert(agentDeliveryTable).values({
        agentId: seed.agentId,
        consecutiveFailures: 3,
        lastFailureAt: new Date(),
        lastFailureKind: 'runtime',
        pausedAt: new Date(),
        pauseStep: 0,
        serverId: seed.serverId,
    });

    await decide(delivery, seed, requestId, 'deny');

    expect(await readRequest(requestId)).toMatchObject({ standing: false, state: 'denied' });
    expect((await inboxRows(seed)).map((row) => row.content)).toEqual([
        "Ada Lovelace denied computer use on Studio in this chat. Next: don't click or type there; say what you need, or go on without it.",
    ]);
    const [state] = await connection.db
        .select({ pausedAt: agentDeliveryTable.pausedAt })
        .from(agentDeliveryTable)
        .where(eq(agentDeliveryTable.agentId, seed.agentId));
    expect(state?.pausedAt).toBeNull();
    expect(await openRequest(seed, 'run_after_deny')).not.toBeNull();
});

test('only a steward decides a request or changes the setting; an open request stays one', async () => {
    const { seed, requestId } = await seedRequest();
    const { delivery } = offlineDelivery(connection.db, seed);
    const memberId = await addMember(seed);

    expect(await openRequest(seed, 'run_second')).toBeNull();
    await expect(
        decideComputerUse(
            connection.db,
            delivery,
            { id: memberId },
            {
                decision: 'allow',
                requestId,
                serverId: seed.serverId,
            }
        )
    ).rejects.toBeInstanceOf(ComputerSetupDeniedError);
    await expect(
        setComputerUse(
            connection.db,
            { id: memberId },
            {
                access: 'always',
                computerId: seed.computerId,
                serverId: seed.serverId,
            }
        )
    ).rejects.toBeInstanceOf(ComputerSetupDeniedError);
    expect(await readRequest(requestId)).toMatchObject({ state: 'requested' });
    expect(await readAccess(seed)).toBe('ask');
    expect(await inboxRows(seed)).toEqual([]);

    await setComputerUse(
        connection.db,
        { id: seed.userId },
        {
            access: 'always',
            computerId: seed.computerId,
            serverId: seed.serverId,
        }
    );
    expect(await readAccess(seed)).toBe('always');
});

test('retention drops expired requests and denials but keeps approvals', async () => {
    const { seed, requestId } = await seedRequest();
    const { delivery } = offlineDelivery(connection.db, seed);
    await decide(delivery, seed, requestId, 'allow');
    const denied = await addChannel(connection.db, seed, 'denied');
    const deniedId = (await openRequest({ ...seed, channelId: denied }, 'run_denied'))?.id ?? '';
    await decide(delivery, seed, deniedId, 'deny');
    const open = await addChannel(connection.db, seed, 'open');
    const openId = (await openRequest({ ...seed, channelId: open }, 'run_open'))?.id ?? '';
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await connection.db
        .update(computerUseRequestsTable)
        .set({ requestedAt: old })
        .where(eq(computerUseRequestsTable.computerId, seed.computerId));

    await deleteExpiredComputerUseRequests(
        connection.db,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    expect(await readRequest(requestId)).toMatchObject({ state: 'allowed' });
    expect(await readRequest(deniedId)).toBeUndefined();
    expect(await readRequest(openId)).toBeUndefined();
});

async function seedRequest() {
    const seed = await seedAgent(connection.db);
    await connection.db
        .update(usersTable)
        .set({ displayName: 'Ada Lovelace' })
        .where(eq(usersTable.id, seed.userId));
    await connection.db.execute(
        sql`update computers set reported_inventory = '{"name":"Studio","runtimes":[]}'::jsonb where id = ${seed.computerId}`
    );
    const opened = await openRequest(seed, 'run_first');
    if (!opened) {
        throw new Error('The first request did not open.');
    }
    return { requestId: opened.id, seed };
}

async function openRequest(seed: Seed, runId: string) {
    return await openComputerUseRequest(connection.db, {
        agentId: seed.agentId,
        args: ['click', '@s1:e8'],
        chatId: seed.channelId,
        computerId: seed.computerId,
        runId,
        serverId: seed.serverId,
        toolCallId: `toolu_${runId}`,
    });
}

async function decide(
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    seed: Seed,
    requestId: string,
    decision: ComputerUseDecision
) {
    return await decideComputerUse(
        connection.db,
        delivery,
        { id: seed.userId },
        {
            decision,
            requestId,
            serverId: seed.serverId,
        }
    );
}

async function addMember(seed: Seed) {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ authSubject: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        id: createOpaqueId('mem'),
        role: 'member',
        serverId: seed.serverId,
        userId,
    });
    return userId;
}

async function readRequest(requestId: string) {
    const [row] = await connection.db
        .select()
        .from(computerUseRequestsTable)
        .where(eq(computerUseRequestsTable.id, requestId));
    return row;
}

async function readAccess(seed: Seed) {
    const [row] = await connection.db
        .select({ access: computersTable.computerUseAccess })
        .from(computersTable)
        .where(eq(computersTable.id, seed.computerId));
    return row?.access;
}

async function inboxRows(seed: Seed) {
    return await connection.db
        .select({
            chatId: agentInboxTable.chatId,
            content: agentInboxTable.content,
            dedupeKey: agentInboxTable.dedupeKey,
            source: agentInboxTable.source,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.source, 'computer_use')
            )
        );
}
