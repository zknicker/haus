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
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import { listAgentTurns } from '../src/server-agents/list-agent-turns.ts';
import { recordAgentTurnSummary } from '../src/server-agents/record-agent-turn.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

/**
 * `agent.turns` names the work that woke each turn. The Server records it once at
 * dispatch, so it survives a failed run requeueing its inbox rows, and it reaches
 * only readers who can see the trigger's Chat.
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

test('a failed turn still names the human message that woke it', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'set up tinylink',
        dedupeKey: 'msg_triggerhuman01',
        serverId: seed.serverId,
    });
    const [runId = ''] = transport.startedRunIds();
    await delivery.onAck({ agentId: seed.agentId, runId });
    // No output: the Server requeues the inbox row, which must not lose the trigger.
    await delivery.onTurnSettled(seed.computerId, summary(seed.agentId, runId, 'failed'));

    const [turn] = await listAgentTurns(connection.db, seed.owner, {
        agentId: seed.agentId,
        limit: 10,
        serverId: seed.serverId,
    });
    expect(turn).toMatchObject({
        runId,
        status: 'failed',
        trigger: {
            author: 'human',
            chatId: seed.chatId,
            kind: 'message',
            messageId: 'msg_triggerhuman01',
        },
    });

    const outsider = await addMember(seed.serverId);
    const [hidden] = await listAgentTurns(connection.db, outsider, {
        agentId: seed.agentId,
        limit: 10,
        serverId: seed.serverId,
    });
    expect(hidden?.trigger).toEqual({ kind: 'private' });
});

test('a turn the Server never dispatched reports no trigger instead of guessing', async () => {
    const seed = await seedAgent();
    await recordAgentTurnSummary(
        connection.db,
        seed.computerId,
        summary(seed.agentId, 'run_triggerlegacy01', 'completed')
    );

    const turns = await listAgentTurns(connection.db, seed.owner, {
        agentId: seed.agentId,
        limit: 10,
        serverId: seed.serverId,
    });
    expect(turns.map((turn) => turn.trigger)).toEqual([null]);
});

test('maps each inbox source to its narrow trigger kind', () => {
    const at = (source: string, workId = 'msg_one') =>
        agentTurnTrigger({ chatId: 'cht_one', source, visible: true, workId });
    expect(at('agent:wren')).toEqual({
        author: 'agent',
        chatId: 'cht_one',
        kind: 'message',
        messageId: 'msg_one',
    });
    expect(at('task_assignment', 'task-assign:msg_task:3')).toEqual({
        chatId: 'cht_one',
        kind: 'task',
        messageId: 'msg_task',
    });
    expect(at('task_assignment', 'not-a-task-key')).toBeNull();
    expect(at('reminder')).toEqual({ chatId: 'cht_one', kind: 'reminder' });
    expect(at('trigger')).toEqual({ chatId: 'cht_one', kind: 'trigger' });
    expect(at('cloud_agent_work')).toEqual({ chatId: 'cht_one', kind: 'cloud_agent' });
    expect(at('onboarding')).toEqual({ chatId: 'cht_one', kind: 'onboarding' });
    expect(at('something_new')).toBeNull();
    expect(agentTurnTrigger(null)).toBeNull();
});

function summary(agentId: string, runId: string, status: 'completed' | 'failed'): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date().toISOString(),
        messageCount: 0,
        modelId: 'fake-model',
        outputProduced: false,
        runId,
        runtimeId: 'fake',
        startedAt: new Date().toISOString(),
        status,
        summary: status,
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

async function seedAgent() {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Triggers', id: serverId, slug: createOpaqueId('slug') });
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
    return { agentId, chatId, computerId, owner: { id: userId } as HausUser, serverId };
}

async function addMember(serverId: string): Promise<HausUser> {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'member',
        serverId,
        userId,
    });
    return { id: userId } as HausUser;
}
