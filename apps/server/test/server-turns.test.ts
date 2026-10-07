import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand, AgentTurnSummary } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { listServerTurns } from '../src/server-agents/list-server-turns.ts';
import { recordAgentTurnSummary } from '../src/server-agents/record-agent-turn.ts';
import { ServerAccessDeniedError } from '../src/servers/server-access.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

/**
 * `agent.serverTurns` interleaves every Agent's settled turns on one Server,
 * newest first, pages them by keyset, and keeps `agent.turns`' trigger gate.
 */
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

test('interleaves Agents newest first and pages without gaps or repeats', async () => {
    const seed = await seedServer();
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 12, minute)).toISOString();
    // Two turns share a start, so the run id must break the tie across a page edge.
    const planned = [
        { agentId: seed.ada, runId: 'run_server_a1', startedAt: at(1) },
        { agentId: seed.bo, runId: 'run_server_b1', startedAt: at(2) },
        { agentId: seed.ada, runId: 'run_server_a2', startedAt: at(3) },
        { agentId: seed.bo, runId: 'run_server_b2', startedAt: at(3) },
        { agentId: seed.ada, runId: 'run_server_a3', startedAt: at(4) },
    ];
    for (const turn of planned) {
        await recordAgentTurnSummary(
            connection.db,
            seed.computerId,
            summary(turn.agentId, turn.runId, turn.startedAt)
        );
    }

    const seen: string[] = [];
    let before: { runId: string; startedAt: string } | undefined;
    for (let page = 0; page < 5; page += 1) {
        const result = await listServerTurns(connection.db, seed.owner, {
            ...(before ? { before } : {}),
            limit: 2,
            serverId: seed.serverId,
        });
        seen.push(...result.turns.map((turn) => turn.runId));
        if (!result.nextBefore) {
            break;
        }
        before = result.nextBefore;
    }
    expect(seen).toEqual([
        'run_server_a3',
        'run_server_b2',
        'run_server_a2',
        'run_server_b1',
        'run_server_a1',
    ]);

    const onlyBo = await listServerTurns(connection.db, seed.owner, {
        agentIds: [seed.bo],
        limit: 10,
        serverId: seed.serverId,
    });
    expect(onlyBo.turns.map((turn) => [turn.agentId, turn.runId])).toEqual([
        [seed.bo, 'run_server_b2'],
        [seed.bo, 'run_server_b1'],
    ]);
    expect(onlyBo.nextBefore).toBeNull();
});

test('gates triggers by Chat visibility and refuses non-members', async () => {
    const seed = await seedServer();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: seed.ada,
        chatId: seed.dmChatId,
        content: 'summarize the week',
        dedupeKey: 'msg_servertrigger01',
        serverId: seed.serverId,
    });
    const [runId = ''] = transport.startedRunIds();
    await delivery.onAck({ agentId: seed.ada, runId });
    await delivery.onTurnSettled(
        seed.computerId,
        summary(seed.ada, runId, new Date().toISOString())
    );

    const owner = await listServerTurns(connection.db, seed.owner, {
        limit: 10,
        serverId: seed.serverId,
    });
    expect(owner.turns[0]?.trigger).toMatchObject({
        kind: 'message',
        messageId: 'msg_servertrigger01',
    });

    const member = await addUser(seed.serverId);
    const hidden = await listServerTurns(connection.db, member, {
        limit: 10,
        serverId: seed.serverId,
    });
    expect(hidden.turns[0]?.trigger).toEqual({ kind: 'private' });

    const stranger = await addUser(null);
    await expect(
        listServerTurns(connection.db, stranger, { limit: 10, serverId: seed.serverId })
    ).rejects.toBeInstanceOf(ServerAccessDeniedError);
});

class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: AgentCommand[] = [];

    isOnline(computerId: string): boolean {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push(frame);
        return true;
    }

    startedRunIds(): string[] {
        return this.sent.flatMap((frame) => (frame.type === 'start' ? [frame.runId] : []));
    }
}

function summary(agentId: string, runId: string, startedAt: string): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date(Date.parse(startedAt) + 30_000).toISOString(),
        messageCount: 1,
        modelId: 'fake-model',
        outputProduced: true,
        runId,
        runtimeId: 'fake',
        startedAt,
        status: 'completed',
        summary: 'completed',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

async function seedServer() {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const dmChatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Server turns', id: serverId, slug: createOpaqueId('slug') });
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
    const agent = async (displayName: string) => {
        const id = createOpaqueId('agt');
        await db.insert(agentsTable).values({
            computerId,
            desiredModelId: 'fake-model',
            desiredRuntimeId: 'fake',
            displayName,
            handle: `${displayName.toLowerCase()}-${randomBytes(4).toString('hex')}`,
            homeTimezone: 'UTC',
            id,
            serverId,
        });
        return id;
    };
    const ada = await agent('Ada');
    const bo = await agent('Bo');
    await db.insert(chatsTable).values({
        dmAgentId: ada,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: dmChatId,
        kind: 'dm',
        serverId,
    });
    return { ada, bo, computerId, dmChatId, owner: { id: userId } as HausUser, serverId };
}

/** A member of `serverId`, or of no Server when it is null. */
async function addUser(serverId: string | null): Promise<HausUser> {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ clerkUserId: createOpaqueId('clk'), id: userId });
    if (serverId) {
        await connection.db.insert(serverMembershipsTable).values({
            handle: `human-${randomBytes(4).toString('hex')}`,
            id: createOpaqueId('mem'),
            role: 'member',
            serverId,
            userId,
        });
    }
    return { id: userId } as HausUser;
}
