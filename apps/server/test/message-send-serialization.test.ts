import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { sendChatMessage } from '../src/chats/send-message.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import {
    type BackgroundClaim,
    FakeTransport,
    seedBackgroundClaim,
} from './background-claim-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { serializedTransactions } from './serialized-db-fixture.ts';

/**
 * A send takes the Server row first and then reads the Agent attention state
 * it has to project — who is in the Channel, who muted it, which DM to write
 * into — all on the transaction's own reserved connection. A read that
 * overlaps another leaves that transaction idle holding the Server row lock,
 * and every later durable write queues behind it until the process dies. These
 * tests drive the real send entry point and fail the moment one overlaps.
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

const settleTimeoutMs = 30_000;

test(
    'a Channel send that mentions an Agent plans recipients without wedging its transaction',
    async () => {
        const claim = await seedChannelParticipants();
        const handle = await agentHandle(claim);

        const result = await sendChatMessage(
            serializedTransactions(connection.db),
            await member(claim),
            {
                attachmentIds: [],
                chatId: claim.chatId,
                content: `@${handle} take a look`,
                nonce: createOpaqueId('non'),
                serverId: claim.serverId,
            },
            delivery()
        );

        // The mention resolved to the Channel's Agent, so the send enqueued it
        // rather than quietly planning nobody.
        expect(result.wakes).toEqual([{ agentId: claim.agentId, serverId: claim.serverId }]);
    },
    settleTimeoutMs
);

test(
    'an Agent DM send materializes its DM without wedging its transaction',
    async () => {
        const claim = await seedChannelParticipants();

        const result = await sendChatMessage(
            serializedTransactions(connection.db),
            await member(claim),
            {
                agentId: claim.agentId,
                attachmentIds: [],
                content: 'opening a DM',
                nonce: createOpaqueId('non'),
                serverId: claim.serverId,
                targetKind: 'agent-dm',
            },
            delivery()
        );

        // The DM was created inside the send and the message landed in it.
        expect(result.receipt.idempotent).toBe(false);
        expect(result.receipt.message.chatId).not.toBe(claim.chatId);
        expect(result.wakes).toEqual([{ agentId: claim.agentId, serverId: claim.serverId }]);
    },
    settleTimeoutMs
);

/** A Channel both the human and the Agent belong to, the shape a send reads. */
async function seedChannelParticipants(): Promise<BackgroundClaim> {
    const claim = await seedBackgroundClaim(connection.db);
    await connection.db.insert(channelAgentParticipantsTable).values({
        agentId: claim.agentId,
        chatId: claim.chatId,
        serverId: claim.serverId,
    });
    await connection.db.insert(channelParticipantsTable).values({
        chatId: claim.chatId,
        serverId: claim.serverId,
        userId: claim.userId,
    });
    return claim;
}

async function agentHandle(claim: BackgroundClaim): Promise<string> {
    const [agent] = await connection.db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(eq(agentsTable.id, claim.agentId));
    return agent.handle;
}

async function member(claim: BackgroundClaim): Promise<HausUser> {
    const [user] = await connection.db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, claim.userId));
    return user;
}

/** Delivery with nobody online: the send still enqueues durable pending work. */
function delivery(): AgentDelivery {
    return new AgentDelivery(connection.db, new FakeTransport());
}
