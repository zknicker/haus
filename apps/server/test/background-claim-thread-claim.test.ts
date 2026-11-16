import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { runLivenessClaimEvents } from '../src/claims/background-claims.ts';
import { findMessageClaim } from '../src/claims/claim-shape.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../src/postgres/schema.ts';
import { ensureThreadRecord } from '../src/threads/ensure-thread.ts';
import {
    type BackgroundClaim,
    FakeTransport,
    seedBackgroundClaim,
    turnSummary,
} from './background-claim-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

/**
 * A Thread claim is held by a run serving its Thread: liveness and the run's
 * liveness events map a Thread inbox row to every claim posted in that Thread,
 * not only to the claim on the Thread's anchor.
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

test('a run serving the containing Thread keeps a Thread claim live until it settles', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const thread = await ensureThreadRecord(connection.db, {
        anchorMessageId: claim.messageId,
        parentChatId: claim.chatId,
        serverId: claim.serverId,
    });
    const claimMessageId = await postInThread(claim, thread.id, 'Can you also tag the release?');
    await connection.db.insert(messageClaimsTable).values({
        assigneeAgentId: claim.agentId,
        chatId: claim.chatId,
        claimedAt: new Date(),
        createdByAgentId: claim.agentId,
        messageId: claimMessageId,
        number: 2,
        origin: 'claimed',
        serverId: claim.serverId,
        status: 'in_progress',
        threadChatId: thread.id,
    });
    // The run serves a later Thread reply, not the claim message itself.
    const laterId = await postInThread(claim, thread.id, 'And ping me when it ships.');
    const transport = new FakeTransport();
    transport.online.add(claim.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: claim.agentId,
        chatId: thread.id,
        content: 'And ping me when it ships.',
        dedupeKey: laterId,
        serverId: claim.serverId,
    });
    const runId = transport.startedRunId();

    expect(await findMessageClaim(connection.db, claim.serverId, claimMessageId)).toMatchObject({
        live: true,
        threadChatId: thread.id,
    });
    const held = await runLivenessClaimEvents(connection.db, {
        agentId: claim.agentId,
        runId,
        serverId: claim.serverId,
    });
    expect(held.map(({ delivery: { event } }) => event.messageId).sort()).toEqual(
        [claim.messageId, claimMessageId].sort()
    );

    await delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, runId));

    expect(await findMessageClaim(connection.db, claim.serverId, claimMessageId)).toMatchObject({
        live: false,
        status: 'in_progress',
        tier: 'tracked',
    });
});

async function postInThread(claim: BackgroundClaim, threadChatId: string, content: string) {
    const id = createOpaqueId('msg');
    const [chat] = await connection.db
        .update(chatsTable)
        .set({ lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1` })
        .where(and(eq(chatsTable.serverId, claim.serverId), eq(chatsTable.id, threadChatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: claim.userId,
        chatId: threadChatId,
        content,
        id,
        nonce: createOpaqueId('non'),
        sequence: chat.sequence,
        serverId: claim.serverId,
    });
    return id;
}
