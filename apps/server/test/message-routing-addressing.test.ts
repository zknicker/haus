import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AgentMessageRecipientPlan } from '../src/agent-delivery/message-recipients.ts';
import { applyMessageRouting } from '../src/message-routing/apply-message-routing.ts';
import { readRoutingAgents } from '../src/message-routing/context.ts';
import type { PreparedMessageRouting } from '../src/message-routing/route-human-message.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

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

interface Channel {
    agentIds: string[];
    chatId: string;
    messageId: string;
    sequence: number;
    serverId: string;
    userId: string;
}

async function seedChannel(agentNames = ['Ada', 'Bo']): Promise<Channel> {
    const db = connection.db;
    const serverId = createOpaqueId('srv');
    const userId = createOpaqueId('usr');
    const chatId = createOpaqueId('cht');
    const messageId = createOpaqueId('msg');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Routing', id: serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    const computerId = createOpaqueId('cmp');
    await db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: computerId,
        serverId,
    });
    const agentIds: string[] = [];
    for (const name of agentNames) {
        const agentId = createOpaqueId('agt');
        agentIds.push(agentId);
        await db.insert(agentsTable).values({
            computerId,
            desiredModelId: 'fake-model',
            desiredRuntimeId: 'fake',
            displayName: name,
            handle: `${name.toLowerCase()}-${randomBytes(4).toString('hex')}`,
            homeTimezone: 'UTC',
            id: agentId,
            serverId,
        });
    }
    await db.insert(chatsTable).values({ id: chatId, kind: 'channel', name: 'product', serverId });
    await db.insert(channelParticipantsTable).values({ chatId, serverId, userId });
    for (const agentId of agentIds) {
        await db
            .insert(channelAgentParticipantsTable)
            .values({ agentId, chatId, id: createOpaqueId('cap'), serverId });
    }
    await db.insert(chatMessagesTable).values({
        authorUserId: userId,
        chatId,
        content: 'Can you take this?',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId,
    });
    return { agentIds: agentIds.sort(), chatId, messageId, sequence: 1, serverId, userId };
}

function ambientRecipients(agentIds: string[]): AgentMessageRecipientPlan[] {
    return agentIds.map((agentId) => ({
        addressedReason: null,
        agentId,
        mentioned: false,
        threadFollowReactivated: false,
    }));
}

async function commit(channel: Channel, prepared: PreparedMessageRouting) {
    return await applyMessageRouting(connection.db, {
        chatId: channel.chatId,
        chatKind: 'channel',
        isReply: false,
        messageId: channel.messageId,
        prepared,
        recipients: ambientRecipients(channel.agentIds),
        sequence: channel.sequence,
        serverId: channel.serverId,
    });
}

async function preparedNarrow(channel: Channel, agentId: string, sequence = channel.sequence) {
    return {
        agentsFingerprint: JSON.stringify(
            await readRoutingAgents(connection.db, channel.serverId, channel.chatId)
        ),
        candidateAgentIds: channel.agentIds,
        decision: { agentId, confidence: 0.95, kind: 'narrow', probability: 0.96 },
        elapsedMs: 12,
        kind: 'judged',
        sequence,
    } satisfies PreparedMessageRouting;
}

test('a narrow at the gate marks the surviving recipient addressed', async () => {
    const channel = await seedChannel();
    const winner = channel.agentIds[0] ?? '';

    const recipients = await commit(channel, await preparedNarrow(channel, winner));

    expect(recipients).toEqual([
        {
            addressedReason: 'routing',
            agentId: winner,
            expectsReply: null,
            mentioned: false,
            threadFollowReactivated: false,
        },
    ]);
});

test('the reply judgment rides every recipient and the audit, unless the snapshot went stale', async () => {
    const channel = await seedChannel();
    const winner = channel.agentIds[0] ?? '';
    const judged = await preparedNarrow(channel, winner);
    const withReply = { ...judged, decision: { ...judged.decision, expectsReply: 0.07 } };
    const uncertain = {
        ...judged,
        decision: { expectsReply: 0.07, kind: 'broadcast', reason: 'uncertain' },
    } satisfies PreparedMessageRouting;

    expect((await commit(channel, withReply)).map((row) => row.expectsReply)).toEqual([0.07]);
    expect((await commit(channel, uncertain)).map((row) => row.expectsReply)).toEqual([0.07, 0.07]);
    const [audit] = await connection.db
        .select({ routing: chatMessagesTable.deliveryRouting })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, channel.messageId));
    expect(audit?.routing?.expectsReply).toBe(0.07);

    const stale = { ...withReply, sequence: channel.sequence + 1 };
    const staleRecipients = await commit(channel, stale);
    expect(staleRecipients.every((row) => row.expectsReply === null)).toBe(true);
});

test('a stale or uncertain routing judgment leaves every row unaddressed', async () => {
    const channel = await seedChannel();
    const winner = channel.agentIds[0] ?? '';
    const stale = await preparedNarrow(channel, winner, channel.sequence + 1);
    const uncertain = {
        ...(await preparedNarrow(channel, winner)),
        decision: { kind: 'broadcast', reason: 'uncertain' },
    } satisfies PreparedMessageRouting;

    for (const prepared of [stale, uncertain]) {
        const recipients = await commit(channel, prepared);
        expect(recipients).toHaveLength(2);
        expect(recipients.every((row) => row.addressedReason === null)).toBe(true);
    }
});

async function addHuman(channel: Channel) {
    const userId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await connection.db.insert(serverMembershipsTable).values({
        id: createOpaqueId('mem'),
        role: 'member',
        serverId: channel.serverId,
        userId,
    });
    await connection.db
        .insert(channelParticipantsTable)
        .values({ chatId: channel.chatId, serverId: channel.serverId, userId });
}

async function auditOf(channel: Channel) {
    const [row] = await connection.db
        .select({ routing: chatMessagesTable.deliveryRouting })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, channel.messageId));
    return row?.routing;
}

test('the sole Agent of a one-human channel is addressed without a judgment', async () => {
    const channel = await seedChannel(['Ada']);
    const agentId = channel.agentIds[0] ?? '';
    const sole = { agentId, authorId: channel.userId, kind: 'sole' } as const;

    expect((await commit(channel, sole)).map((row) => row.addressedReason)).toEqual(['sole']);
    expect(await auditOf(channel)).toMatchObject({
        bypassReason: 'sole',
        model: null,
        outcome: 'bypass',
        recipientAgentIds: [agentId],
    });

    // A second human joining before the commit makes it ordinary channel traffic.
    await addHuman(channel);
    expect((await commit(channel, sole)).map((row) => row.addressedReason)).toEqual([null]);
    expect(await auditOf(channel)).toMatchObject({ bypassReason: null, outcome: 'stale' });
});

test('a judgment over one eligible Agent addresses it at the gate and never changes recipients', async () => {
    const channel = await seedChannel(['Ada']);
    await addHuman(channel);
    const agentId = channel.agentIds[0] ?? '';
    const narrow = await preparedNarrow(channel, agentId);
    const uncertain = {
        ...narrow,
        decision: { expectsReply: 0.1, kind: 'broadcast', reason: 'uncertain' },
    } satisfies PreparedMessageRouting;

    expect(await commit(channel, narrow)).toEqual([
        {
            addressedReason: 'routing',
            agentId,
            expectsReply: null,
            mentioned: false,
            threadFollowReactivated: false,
        },
    ]);
    expect(await commit(channel, uncertain)).toEqual([
        {
            addressedReason: null,
            agentId,
            expectsReply: 0.1,
            mentioned: false,
            threadFollowReactivated: false,
        },
    ]);
});
