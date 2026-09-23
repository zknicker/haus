import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { prepareAgentSend } from '../src/agent-api/send-hold.ts';
import { readDeliveryState } from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxExactVisibilityTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
} from '../src/postgres/schema.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

/** A human channel message the Chat head has advanced to, as a real send leaves it. */
async function postToChannel(
    seed: Seed,
    delivery: ReturnType<typeof offlineDelivery>['delivery'],
    content: string
) {
    const id = await deliverHuman(connection.db, delivery, seed, {
        chatId: seed.channelId,
        content,
    });
    const [message] = await connection.db
        .select({ sequence: chatMessagesTable.sequence })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, id));
    const sequence = message?.sequence ?? 0;
    await connection.db
        .update(chatsTable)
        .set({ lastMessageSequence: sequence })
        .where(eq(chatsTable.id, seed.channelId));
    return { chatId: seed.channelId, id, sequence };
}

/** Wakes the Agent on a channel message and accepts the run, as the Computer's ack does. */
async function wakeOn(content: string) {
    const seed = await seedAgent(connection.db);
    await connection.db.insert(channelAgentParticipantsTable).values({
        agentId: seed.agentId,
        chatId: seed.channelId,
        id: createOpaqueId('cap'),
        serverId: seed.serverId,
    });
    const { delivery, transport, wake } = offlineDelivery(connection.db, seed);
    const wakeMessage = await postToChannel(seed, delivery, content);
    const start = await wake();
    expect(start?.warmDrainItemIds).toEqual([wakeMessage.id]);
    const runId = start?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const runner = {
        agentId: seed.agentId,
        capabilities: [],
        chatId: seed.channelId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    };
    return { delivery, runner, seed, transport, wakeMessage };
}

function reply(content: string) {
    return {
        attachmentIds: [],
        content,
        continueAnyway: false,
        nonce: createOpaqueId('nonce'),
        sendDraft: false,
    };
}

test('a drained wake message is exact-visible before the turn settles', async () => {
    const { delivery, runner, seed, transport, wakeMessage } = await wakeOn(
        'Can you check the deploy?'
    );

    // The receipt the Computer posts as it composes the warm drain.
    await expect(
        attestAgentEvents(connection.db, runner, [wakeMessage], { composed: true })
    ).resolves.toEqual({ accepted: [wakeMessage.id] });

    const visibility = await connection.db
        .select({
            seenAt: agentInboxExactVisibilityTable.seenAt,
            servedRunId: agentInboxExactVisibilityTable.servedRunId,
        })
        .from(agentInboxExactVisibilityTable)
        .where(
            and(
                eq(agentInboxExactVisibilityTable.agentId, seed.agentId),
                eq(agentInboxExactVisibilityTable.messageId, wakeMessage.id)
            )
        );
    expect(visibility).toEqual([{ seenAt: null, servedRunId: runner.runId }]);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBe(runner.runId);

    // The row stays offered, so a resend still composes the same warm drain.
    await delivery.onComputerReconnect(seed.computerId);
    expect(transport.framesOfType('start').at(-1)).toMatchObject({
        runId: runner.runId,
        warmDrainItemIds: [wakeMessage.id],
    });
});

test("the freshness hold does not fire on a message the run's prompt carried", async () => {
    const { delivery, runner, seed, wakeMessage } = await wakeOn('Can you check the deploy?');
    await attestAgentEvents(connection.db, runner, [wakeMessage], { composed: true });

    const answer = await prepareAgentSend(
        connection.db,
        runner,
        seed.channelId,
        reply('Checking now.')
    );
    expect(answer.kind).toBe('send');

    // The hold itself is intact: news the prompt did not carry still holds.
    const news = await postToChannel(seed, delivery, 'Actually, it is fixed.');
    const stale = await prepareAgentSend(
        connection.db,
        runner,
        seed.channelId,
        reply('Deploy looks broken.')
    );
    expect(stale.kind).toBe('held');
    expect(stale.kind === 'held' ? stale.response.shownMessages.map(({ id }) => id) : []).toEqual([
        news.id,
    ]);
});
