import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand, AgentTurnSummary } from '@haus/api';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { listAgentTurns } from '../src/server-agents/list-agent-turns.ts';
import {
    readAgentRunTrigger,
    readAgentRunTriggers,
} from '../src/server-agents/read-agent-run-trigger.ts';
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

test('a failed turn still names and quotes the human message that woke it', async () => {
    const seed = await seedAgent();
    await insertMessage(seed, 'msg_triggerhuman01', 'set up **tinylink**');
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
            preview: { attachmentCount: 0, content: 'set up **tinylink**' },
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

test('a running turn names its trigger before it settles, gated like agent.turns', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'draft the launch post',
        dedupeKey: 'msg_triggerrunning01',
        serverId: seed.serverId,
    });
    const [runId = ''] = transport.startedRunIds();
    await delivery.onAck({ agentId: seed.agentId, runId });

    const input = { agentId: seed.agentId, runId, serverId: seed.serverId };
    expect(await listAgentTurns(connection.db, seed.owner, { ...input, limit: 1 })).toEqual([]);
    // No stored message behind the trigger: it is named, with nothing to quote.
    expect(await readAgentRunTrigger(connection.db, seed.owner, input)).toEqual({
        trigger: {
            author: 'human',
            chatId: seed.chatId,
            kind: 'message',
            messageId: 'msg_triggerrunning01',
            preview: null,
        },
    });
    expect(
        await readAgentRunTriggers(connection.db, seed.owner, {
            agentId: seed.agentId,
            runIds: [runId, runId, 'run_unknown02'],
            serverId: seed.serverId,
        })
    ).toEqual([
        {
            runId,
            trigger: {
                author: 'human',
                chatId: seed.chatId,
                kind: 'message',
                messageId: 'msg_triggerrunning01',
                preview: null,
            },
        },
        { runId: 'run_unknown02', trigger: null },
    ]);

    const outsider = await addMember(seed.serverId);
    expect(await readAgentRunTrigger(connection.db, outsider, input)).toEqual({
        trigger: { kind: 'private' },
    });
    expect(
        await readAgentRunTriggers(connection.db, outsider, {
            agentId: seed.agentId,
            runIds: [runId],
            serverId: seed.serverId,
        })
    ).toEqual([{ runId, trigger: { kind: 'private' } }]);
    expect(
        await readAgentRunTrigger(connection.db, seed.owner, { ...input, runId: 'run_unknown01' })
    ).toEqual({ trigger: null });
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

async function insertMessage(
    seed: Awaited<ReturnType<typeof seedAgent>>,
    id: string,
    content: string
) {
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.owner.id,
        chatId: seed.chatId,
        content,
        id,
        nonce: id,
        sequence: 1,
        serverId: seed.serverId,
    });
}

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
