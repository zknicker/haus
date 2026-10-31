import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand, AgentTurnSummary } from '@haus/api';
import { eq } from 'drizzle-orm';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentsTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The automation chain budget through real delivery: Trigger wakes spend it,
// human work resets it, the ceiling holds until a human speaks, and a chain
// idle for half an hour below the ceiling restarts.

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

class Wire implements DeliveryTransport {
    readonly starts: Extract<AgentCommand, { type: 'start' }>[] = [];
    isOnline() {
        return true;
    }
    send(_computerId: string, frame: AgentCommand) {
        if (frame.type === 'start') {
            this.starts.push(frame);
        }
        return true;
    }
}

test('Trigger drains spend the chain and hold at the ceiling until a human speaks', async () => {
    const seed = await seedAgent({ advancedAt: new Date(), turns: 15 });
    const wire = new Wire();
    const delivery = new AgentDelivery(connection.db, wire);

    await fire(delivery, seed, 'trf_one');
    await settle(delivery, seed, wire.starts.at(-1)?.runId ?? '');
    const spent = await chainOf(seed.agentId);
    expect(spent?.agentChainTurns).toBe(16);
    expect(spent?.agentChainAdvancedAt).toBeInstanceOf(Date);

    await fire(delivery, seed, 'trf_two');
    expect(wire.starts).toHaveLength(1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'are you there?',
        dedupeKey: 'msg-human',
        serverId: seed.serverId,
    });
    // Human intent resets the chain on arrival and releases the held fire,
    // which leads its own run; the human row drains after it.
    expect(wire.starts).toHaveLength(2);
    await settle(delivery, seed, wire.starts[1]?.runId ?? '');
    expect((await chainOf(seed.agentId))?.agentChainTurns).toBe(1);
    expect(wire.starts).toHaveLength(3);
    await settle(delivery, seed, wire.starts[2]?.runId ?? '');
    expect(await chainOf(seed.agentId)).toEqual({ agentChainAdvancedAt: null, agentChainTurns: 0 });
});

for (const source of ['reminder', 'task_assignment'] as const) {
    test(`a ${source} at the ceiling leads ahead of the held Trigger and resets the chain`, async () => {
        const seed = await seedAgent({ advancedAt: new Date(), turns: 16 });
        const wire = new Wire();
        const delivery = new AgentDelivery(connection.db, wire);
        await fire(delivery, seed, `trf_held_${source}`);
        expect(wire.starts).toHaveLength(0);

        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: `${source} work`,
            dedupeKey: `${source}-one`,
            serverId: seed.serverId,
            source,
        });
        // The reset-capable work drains first, so the held fire never rides
        // along to a seventeenth automation turn.
        expect(wire.starts).toHaveLength(1);
        await settle(delivery, seed, wire.starts[0]?.runId ?? '');
        expect(await chainOf(seed.agentId)).toEqual({
            agentChainAdvancedAt: null,
            agentChainTurns: 0,
        });
        expect(wire.starts).toHaveLength(2);
        await settle(delivery, seed, wire.starts[1]?.runId ?? '');
        expect((await chainOf(seed.agentId))?.agentChainTurns).toBe(1);
    });
}

test('a Reminder behind more held fires than the drain windows hold still resets the chain', async () => {
    const seed = await seedAgent({ advancedAt: new Date(), turns: 16 });
    const wire = new Wire();
    const delivery = new AgentDelivery(connection.db, wire);
    for (let index = 0; index < 51; index += 1) {
        await fire(delivery, seed, `trf_backlog_${index}`);
    }
    expect(wire.starts).toHaveLength(0);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'reminder work',
        dedupeKey: 'reminder-beyond-window',
        serverId: seed.serverId,
        source: 'reminder',
    });
    expect(wire.starts).toHaveLength(1);
    await settle(delivery, seed, wire.starts[0]?.runId ?? '');
    expect(await chainOf(seed.agentId)).toEqual({ agentChainAdvancedAt: null, agentChainTurns: 0 });
});

test('a chain idle for half an hour restarts below the ceiling; a recent one does not', async () => {
    const idle = await seedAgent({ advancedAt: new Date(Date.now() - 31 * 60 * 1000), turns: 9 });
    const wire = new Wire();
    const delivery = new AgentDelivery(connection.db, wire);
    await fire(delivery, idle, 'trf_idle');
    expect(wire.starts).toHaveLength(1);
    expect((await chainOf(idle.agentId))?.agentChainTurns).toBe(0);
    await settle(delivery, idle, wire.starts[0]?.runId ?? '');
    expect((await chainOf(idle.agentId))?.agentChainTurns).toBe(1);

    const recent = await seedAgent({ advancedAt: new Date(Date.now() - 29 * 60 * 1000), turns: 9 });
    await fire(delivery, recent, 'trf_recent');
    await settle(delivery, recent, wire.starts[1]?.runId ?? '');
    expect((await chainOf(recent.agentId))?.agentChainTurns).toBe(10);
});

test('an exhausted chain never times out', async () => {
    const seed = await seedAgent({ advancedAt: new Date(Date.now() - 2 * 3_600_000), turns: 16 });
    const wire = new Wire();
    const delivery = new AgentDelivery(connection.db, wire);
    await fire(delivery, seed, 'trf_held');
    expect(wire.starts).toHaveLength(0);
    expect((await chainOf(seed.agentId))?.agentChainTurns).toBe(16);
});

async function chainOf(agentId: string) {
    const [row] = await connection.db
        .select({
            agentChainAdvancedAt: agentDeliveryTable.agentChainAdvancedAt,
            agentChainTurns: agentDeliveryTable.agentChainTurns,
        })
        .from(agentDeliveryTable)
        .where(eq(agentDeliveryTable.agentId, agentId));
    return row;
}

interface Seed {
    agentId: string;
    chatId: string;
    computerId: string;
    serverId: string;
}

async function fire(delivery: AgentDelivery, seed: Seed, fireId: string) {
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: `⚡ Trigger: CI failed (${fireId})`,
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'trigger',
    });
}

async function settle(delivery: AgentDelivery, seed: Seed, runId: string) {
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId));
}

async function seedAgent(chain: { advancedAt: Date; turns: number }): Promise<Seed> {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Chain', id: serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    await db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: computerId,
        serverId,
    });
    await db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Ada',
        handle: `ada-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId,
    });
    await db.insert(chatsTable).values({
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: chatId,
        kind: 'dm',
        serverId,
    });
    await db.insert(agentDeliveryTable).values({
        agentChainAdvancedAt: chain.advancedAt,
        agentChainTurns: chain.turns,
        agentId,
        serverId,
    });
    return { agentId, chatId, computerId, serverId };
}

function turnSummary(agentId: string, runId: string): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date().toISOString(),
        messageCount: 1,
        modelId: 'gpt-test',
        outputProduced: true,
        runId,
        runtimeId: 'codex',
        startedAt: new Date().toISOString(),
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
