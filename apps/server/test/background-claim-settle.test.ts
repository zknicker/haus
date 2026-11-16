import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { messageClaimsTable } from '../src/postgres/schema.ts';
import { claimChangedTopic } from '../src/realtime/topics.ts';
import {
    answerInChat,
    beginRun,
    FakeTransport,
    readClaim,
    recordRunOperation,
    replyInThread,
    seedBackgroundClaim,
    seedPeerAgent,
    sendHumanMessage,
    turnSummary,
} from './background-claim-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { captureTopic, settleRealtime } from './realtime-capture.ts';

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

test('a claim the run answers stays open and tracked until explicit completion', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId);

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    // A run reply is evidence of conversation only. The Agent must explicitly
    // update the claim to `done`.
    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

const runClock = (seconds: number) => new Date(Date.UTC(2026, 8, 8, 12, 0, seconds));

test('an acknowledgment the run kept working past leaves the claim tracked', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId, runClock(1));
    await recordRunOperation(connection.db, claim, run.runId, runClock(2));

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('an acknowledgment, work, then a real answer still leaves the claim open', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId, runClock(1));
    await recordRunOperation(connection.db, claim, run.runId, runClock(2));
    await answerInChat(connection.db, claim, run.runId, runClock(3));

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a reply from a run that used no tools still needs explicit completion', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId, runClock(1));

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a claim that outlives its settled run stays in progress and becomes tracked', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a claimant Thread reply does not affect settlement tier', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId);
    await replyInThread(connection.db, claim, { agentId: claim.agentId });

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

// An unmentioned peer Agent replied in the anchor's Thread before the assignee
// had even claimed. Thread replies do not affect claim tier, and a settled open
// claim is tracked regardless of who spoke there.
test("a peer Agent's Thread reply does not change settlement", async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const peerAgentId = await seedPeerAgent(connection.db, claim);
    await replyInThread(connection.db, claim, { agentId: peerAgentId });
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId);

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test("a bystander's Thread reply does not promote the claim either", async () => {
    const claim = await seedBackgroundClaim(connection.db);
    await replyInThread(connection.db, claim, { userId: claim.userId });

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'background',
    });
});

test('a failed run leaves the claim in progress and tracked', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);

    await run.delivery.onTurnSettled(
        claim.computerId,
        turnSummary(claim.agentId, run.runId, 'failed')
    );

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a reply from a different run in the same Chat does not complete the claim', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    // Same Agent, same Chat, another run: run output never completes a claim.
    await answerInChat(connection.db, claim, `${run.runId}-other`);

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a failed run that replied tracks the claim rather than closing it', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId);

    await run.delivery.onTurnSettled(
        claim.computerId,
        turnSummary(claim.agentId, run.runId, 'failed')
    );

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('a run a human stops leaves its claim tracked and in progress', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);

    await run.delivery.stop({ agentId: claim.agentId, serverId: claim.serverId });

    expect(await readClaim(connection.db, claim)).toMatchObject({
        live: false,
        status: 'in_progress',
        tier: 'tracked',
    });
});

test('an interrupted run leaves its claim tracked and emits a claim update', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    const updates = captureTopic(claimChangedTopic);

    await run.delivery.onTurnSettled(
        claim.computerId,
        turnSummary(claim.agentId, run.runId, 'interrupted')
    );

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'in_progress',
        tier: 'tracked',
    });
    await settleRealtime();
    expect(updates.events).toEqual([
        {
            chatId: claim.chatId,
            kind: 'updated',
            messageId: claim.messageId,
            serverId: claim.serverId,
        },
    ]);
    updates.stop();
});

test('a claim the Agent closed itself settles without a second write', async () => {
    // The Agent prompt tells it to reply and set same-turn work `done` itself.
    // Auto-resolve must be a no-op then: no double-fire, no error, no reopen.
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);
    await answerInChat(connection.db, claim, run.runId);
    await connection.db
        .update(messageClaimsTable)
        .set({ status: 'done', version: sql`${messageClaimsTable.version} + 1` })
        .where(
            and(
                eq(messageClaimsTable.serverId, claim.serverId),
                eq(messageClaimsTable.messageId, claim.messageId)
            )
        );
    const closed = await readClaim(connection.db, claim);

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({
        status: 'done',
        tier: 'background',
        version: closed?.version,
    });
});

test('a claim is live while its assignee runs on it and not after settling', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const run = await beginRun(connection.db, claim);

    expect(await readClaim(connection.db, claim)).toMatchObject({ live: true, tier: 'background' });

    await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

    expect(await readClaim(connection.db, claim)).toMatchObject({ live: false });
});

test('a run serving another message leaves the claim idle', async () => {
    const claim = await seedBackgroundClaim(connection.db);
    const other = await sendHumanMessage(connection.db, claim, 'unrelated work');
    const transport = new FakeTransport();
    transport.online.add(claim.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: claim.agentId,
        chatId: claim.chatId,
        content: 'unrelated work',
        dedupeKey: other,
        serverId: claim.serverId,
    });

    expect(await readClaim(connection.db, claim)).toMatchObject({ live: false });
});
