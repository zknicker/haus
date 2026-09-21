import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import type { AgentCommand, AgentTurnSummary } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import { attestAgentEvents, pullAgentEvents } from '../src/agent-api/inbox.ts';
import { advanceSeenCursor, markCursorSubsumedSeen } from '../src/agent-delivery/cursors.ts';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { subscribeToAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { countQueuedInboxItems, readDeliveryState } from '../src/agent-delivery/store.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentActivityTable,
    agentDeliveryTable,
    agentInboxCursorsTable,
    agentInboxExactVisibilityTable,
    agentInboxTable,
    agentRunnerCredentialsTable,
    agentSessionRotationsTable,
    agentsTable,
    agentTurnsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    messageTasksTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { configureAgent } from '../src/server-agents/configure-agent.ts';
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

/** A Computer wire that records frames only for attached (online) Computers. */
class FakeTransport implements DeliveryTransport {
    readonly online = new Set<string>();
    readonly sent: { computerId: string; frame: AgentCommand }[] = [];

    isOnline(computerId: string): boolean {
        return this.online.has(computerId);
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.online.has(computerId)) {
            return false;
        }
        this.sent.push({ computerId, frame });
        return true;
    }

    framesOfType<T extends AgentCommand['type']>(type: T) {
        return this.sent
            .map((entry) => entry.frame)
            .filter((frame): frame is Extract<AgentCommand, { type: T }> => frame.type === type);
    }
}

interface Seed {
    agentHandle: string;
    agentId: string;
    chatId: string;
    computerId: string;
    serverId: string;
    userId: string;
}

async function seedAgent(runtimeId = 'fake'): Promise<Seed> {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const agentHandle = `ada-${randomBytes(4).toString('hex')}`;
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Delivery', id: serverId, slug: createOpaqueId('slug') });
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
        desiredRuntimeId: runtimeId,
        displayName: 'Ada',
        handle: agentHandle,
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
    return { agentHandle, agentId, chatId, computerId, serverId, userId };
}

function turnSummary(
    agentId: string,
    runId: string,
    status: 'completed' | 'failed',
    outputProduced: boolean = status === 'completed',
    failureKind?: AgentTurnSummary['failureKind']
): AgentTurnSummary {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date().toISOString(),
        ...(failureKind ? { failureKind } : {}),
        messageCount: outputProduced ? 1 : 0,
        modelId: 'gpt-test',
        outputProduced,
        runId,
        runtimeId: 'codex',
        startedAt: new Date().toISOString(),
        status,
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

async function countTurns(agentId: string): Promise<number> {
    const rows = await connection.db
        .select({ id: agentTurnsTable.id })
        .from(agentTurnsTable)
        .where(eq(agentTurnsTable.agentId, agentId));
    return rows.length;
}

/**
 * Rows still in the delivery pipeline. Settled `seen` rows are retained as turn
 * evidence, so they are not pending work any more.
 */
async function countUnsettledPending(agentId: string): Promise<number> {
    const rows = await connection.db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, agentId), ne(agentInboxTable.state, 'seen')));
    return rows.length;
}

async function readDeliveryLedger(agentId: string) {
    return await connection.db
        .select({
            acceptedAt: agentInboxTable.acceptedAt,
            dedupeKey: agentInboxTable.dedupeKey,
            seenAt: agentInboxTable.seenAt,
            servedAt: agentInboxTable.servedAt,
            settledRunId: agentInboxTable.settledRunId,
            state: agentInboxTable.state,
        })
        .from(agentInboxTable)
        .where(eq(agentInboxTable.agentId, agentId));
}

/** Session rotations are Agent facts now; the transcript never records one. */
async function readRotations(agentId: string) {
    return await connection.db
        .select({
            generation: agentSessionRotationsTable.generation,
            reason: agentSessionRotationsTable.reason,
        })
        .from(agentSessionRotationsTable)
        .where(eq(agentSessionRotationsTable.agentId, agentId))
        .orderBy(agentSessionRotationsTable.generation);
}

async function readChatMessageContents(chatId: string) {
    return await connection.db
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, chatId));
}

async function readExactVisibility(agentId: string) {
    return await connection.db
        .select({
            messageId: agentInboxExactVisibilityTable.messageId,
            seenAt: agentInboxExactVisibilityTable.seenAt,
            servedRunId: agentInboxExactVisibilityTable.servedRunId,
        })
        .from(agentInboxExactVisibilityTable)
        .where(eq(agentInboxExactVisibilityTable.agentId, agentId));
}

async function insertHumanMessage(seed: Seed, content: string, sequence: number): Promise<string> {
    const messageId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: seed.chatId,
        content,
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence,
        serverId: seed.serverId,
    });
    return messageId;
}

/** Adds a second Owner↔Agent DM for the same Agent, seated by a fresh user. */
async function addDmChat(seed: Seed): Promise<string> {
    const db = connection.db;
    const userId = createOpaqueId('usr');
    const chatId = createOpaqueId('cht');
    await db.insert(usersTable).values({ clerkUserId: createOpaqueId('clk'), id: userId });
    await db.insert(serverMembershipsTable).values({
        handle: `human-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'member',
        serverId: seed.serverId,
        userId,
    });
    await db.insert(chatsTable).values({
        dmAgentId: seed.agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id: chatId,
        kind: 'dm',
        serverId: seed.serverId,
    });
    return chatId;
}

test('offers ordinary Chat work as a notice and does not loop when it is deferred', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const lifecycleController = new AbortController();
    const lifecycle = subscribeToAgentLifecycle(lifecycleController.signal)[Symbol.asyncIterator]();
    const working = lifecycle.next();

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'hello there',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(1);
    expect(starts[0]?.agentName).toBe(seed.agentHandle);
    expect(starts[0]?.homeTimezone).toBe('UTC');
    expect(starts[0]?.inbox.map((item) => item.content)).toEqual(['hello there']);
    expect(starts[0]?.inboxDelivery).toBe('notice');
    const runId = starts[0]?.runId ?? '';
    expect(await working).toMatchObject({
        done: false,
        value: { agentId: seed.agentId, chatId: seed.chatId, phase: 'working', runId },
    });

    const beforeAck = await readDeliveryState(connection.db, seed.agentId);
    expect(beforeAck?.activeRunId).toBe(runId);
    expect(beforeAck?.acceptedAt).toBeNull();

    const reading = lifecycle.next();
    await delivery.onAck({ agentId: seed.agentId, runId });
    const afterAck = await readDeliveryState(connection.db, seed.agentId);
    expect(afterAck?.acceptedAt).not.toBeNull();
    expect(await reading).toMatchObject({
        done: false,
        value: { agentId: seed.agentId, chatId: seed.chatId, phase: 'reading', runId },
    });

    const completed = lifecycle.next();
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));
    const settled = await readDeliveryState(connection.db, seed.agentId);
    expect(settled?.activeRunId).toBeNull();
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(1);
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await completed).toMatchObject({
        done: false,
        value: {
            agentId: seed.agentId,
            chatId: seed.chatId,
            outcome: 'completed',
            phase: 'settled',
            runId,
        },
    });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'new identity',
        dedupeKey: 'msg-2',
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')).toHaveLength(2);
    expect(transport.framesOfType('start')[1]?.inbox.map((item) => item.content)).toEqual([
        'hello there',
        'new identity',
    ]);
    lifecycleController.abort();
});
test('preserves direct-attention metadata independently through wire replay', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: '@ada please inspect this.',
        dedupeKey: 'msg-mentioned-replay',
        mentioned: true,
        serverId: seed.serverId,
        threadFollowReactivated: true,
    });
    await delivery.dispatchAgent(seed.agentId, seed.serverId, { resendActive: true });

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts.map((frame) => frame.inbox[0]?.mentioned)).toEqual([true, true]);
    expect(starts.map((frame) => frame.inbox[0]?.threadFollowReactivated)).toEqual([true, true]);
});

test('keeps a queued message bound to its retired author after handle reuse', async () => {
    const seed = await seedAgent();
    const authorId = createOpaqueId('agt');
    const replacementId = createOpaqueId('agt');
    const handle = `echo-${randomBytes(4).toString('hex')}`;
    const messageId = createOpaqueId('msg');
    await connection.db.insert(agentsTable).values({
        computerId: seed.computerId,
        description: 'Original teammate',
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Echo',
        handle,
        homeTimezone: 'UTC',
        id: authorId,
        serverId: seed.serverId,
    });
    await connection.db.insert(chatMessagesTable).values({
        authorAgentId: authorId,
        chatId: seed.chatId,
        content: 'Historical work',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: seed.serverId,
    });
    await connection.db
        .update(agentsTable)
        .set({ retiredAt: new Date() })
        .where(eq(agentsTable.id, authorId));
    await connection.db.insert(agentsTable).values({
        computerId: seed.computerId,
        description: 'Replacement teammate',
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Echo',
        handle,
        homeTimezone: 'UTC',
        id: replacementId,
        serverId: seed.serverId,
    });

    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Historical work',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
        source: `agent:${handle}`,
    });

    expect(transport.framesOfType('start')[0]?.inbox[0]).toMatchObject({
        senderDescription: 'Original teammate',
        senderHandle: handle,
        senderType: 'agent',
    });
});

test('projects a trigger fire as its own sender type from @trigger', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: '⚡ Trigger: Sentry alerts',
        dedupeKey: createOpaqueId('trf'),
        sequence: 1,
        serverId: seed.serverId,
        source: 'trigger',
    });

    expect(transport.framesOfType('start')[0]?.inbox[0]).toMatchObject({
        senderHandle: 'trigger',
        senderType: 'trigger',
    });
});

test('pending Cove work cannot start before the durable factory acknowledgement', async () => {
    const seed = await seedAgent();
    await connection.db
        .update(agentsTable)
        .set({ factoryAppliedAt: null, factoryKind: 'cove' })
        .where(eq(agentsTable.id, seed.agentId));
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'arrived during setup',
        dedupeKey: 'pending-cove',
        serverId: seed.serverId,
    });

    expect(transport.framesOfType('start')).toHaveLength(0);
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(1);
});

test('delivers non-Chat onboarding attention concretely without entering message check', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Introduce yourself once.',
        dedupeKey: createOpaqueId('app'),
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const start = transport.framesOfType('start')[0];
    expect(start?.inboxDelivery).toBe('concrete');
    expect(start?.inbox[0]?.message).toBeUndefined();
    await delivery.onAck({ agentId: seed.agentId, runId: start?.runId ?? '' });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, start?.runId ?? '', 'completed')
    );
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
});

test('keeps onboarding attention out of message check while an ordinary turn is live', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'ordinary', 1);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'ordinary',
        dedupeKey: messageId,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Introduce yourself once.',
        dedupeKey: createOpaqueId('app'),
        serverId: seed.serverId,
        source: 'onboarding',
    });

    const pulled = await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });
    expect(pulled.messages.map((row) => row.message.id)).toEqual([messageId]);
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));
    expect(transport.framesOfType('start')[1]?.inboxDelivery).toBe('concrete');
    expect(transport.framesOfType('start')[1]?.inbox[0]?.senderType).toBe('system');
});

test('resends an unacknowledged delivery idempotently on the retry sweep', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'ping',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId;

    // No ack arrives; the sweep resends the same run, never a second one.
    await delivery.sweep();
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.runId).toBe(runId);
});

test('ignores a duplicate delivery of the same message', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);
    // Offline, so work stays queued and the dedupe is observable as a count.

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'once',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'once',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    // The second delivery deduped: only one inbox row ever existed (already
    // claimed into the offline run), so reconnect redelivers exactly one start.
    expect(await countUnsettledPending(seed.agentId)).toBe(1);

    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);
    expect(transport.framesOfType('agent-configure')).toEqual([
        {
            agentDescription: null,
            agentId: seed.agentId,
            agentName: 'Ada',
            // A human-created Agent carries no standing brief, stated not omitted.
            brief: null,
            briefAuthorHandle: null,
            factoryKind: 'ordinary',
            modelId: 'fake-model',
            reasoningEffort: 'medium',
            runtimeId: 'fake',
            sessionGeneration: 1,
            sessionResetKind: 'session',
            type: 'agent-configure',
        },
    ]);
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(1);
    expect(starts[0]?.inbox.map((item) => item.content)).toEqual(['once']);
});

test('replays durable Agent retirement tombstones on Computer reconnect', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);
    transport.online.add(seed.computerId);

    delivery.retireAgent({ agentId: seed.agentId, computerId: seed.computerId });
    expect(transport.framesOfType('agent-retire')).toEqual([
        { agentId: seed.agentId, type: 'agent-retire' },
    ]);
    transport.sent.length = 0;

    await connection.db
        .update(agentsTable)
        .set({ retiredAt: new Date() })
        .where(eq(agentsTable.id, seed.agentId));

    await delivery.onComputerReconnect(seed.computerId);

    expect(transport.framesOfType('agent-retire')).toEqual([
        { agentId: seed.agentId, type: 'agent-retire' },
    ]);
    expect(transport.framesOfType('agent-configure')).toEqual([]);
    expect(transport.framesOfType('start')).toEqual([]);
});

test('reconnect configuration preserves Cove factory identity', async () => {
    const seed = await seedAgent();
    await connection.db
        .update(agentsTable)
        .set({ factoryAppliedAt: new Date(), factoryKind: 'cove' })
        .where(eq(agentsTable.id, seed.agentId));
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.onComputerReconnect(seed.computerId);

    expect(transport.framesOfType('agent-configure')).toEqual([
        expect.objectContaining({ agentId: seed.agentId, factoryKind: 'cove' }),
    ]);
});

test.each([false, true])('busy notice acknowledgment=%s', async (acknowledged) => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const firstMessageId = await insertHumanMessage(seed, 'first', 1);
    const secondMessageId = await insertHumanMessage(seed, 'second', 2);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'first',
        dedupeKey: firstMessageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    const firstRun = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: firstRun });

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'second',
        dedupeKey: secondMessageId,
        sequence: 2,
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    const notices = transport.framesOfType('notice');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.inbox.map((item) => item.content)).toEqual(['first', 'second']);
    expect(notices[0]?.totalPending).toBe(2);
    const firstInbox = transport.framesOfType('start')[0]?.inbox.map((item) => item.content);
    expect(firstInbox).toEqual(['first']);
    if (acknowledged) {
        await delivery.onNoticeAck({
            agentId: seed.agentId,
            workIds: [firstMessageId, secondMessageId],
            runId: firstRun,
        });
    }

    // An unacknowledged notice must earn a turn; a delivered notice permits silence.
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, firstRun, 'completed'));
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(acknowledged ? 1 : 2);
    if (!acknowledged) {
        expect(starts[1]?.inbox.some((item) => item.id === secondMessageId)).toBe(true);
    }
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(2);
});

test('settles explicitly pulled busy work with the active run without a second turn', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const firstMessageId = await insertHumanMessage(seed, 'first', 1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'first',
        dedupeKey: firstMessageId,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const followUpMessageId = await insertHumanMessage(seed, 'follow up', 2);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'follow up',
        dedupeKey: followUpMessageId,
        serverId: seed.serverId,
    });
    const pulled = await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });
    expect(pulled.messages.map((row) => row.message.content)).toEqual(['first', 'follow up']);
    expect(await readExactVisibility(seed.agentId)).toMatchObject([
        { messageId: firstMessageId, seenAt: null, servedRunId: runId },
        { messageId: followUpMessageId, seenAt: null, servedRunId: runId },
    ]);

    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
    expect((await readExactVisibility(seed.agentId)).every((row) => row.seenAt)).toBe(true);
});

test('settles exact Computer-local visibility carried by the turn summary', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'local cache body', 1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'local cache body',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, {
        ...turnSummary(seed.agentId, runId, 'completed'),
        visibleMessages: [{ chatId: seed.chatId, id: messageId, sequence: 1 }],
    });

    expect(await countUnsettledPending(seed.agentId)).toBe(0);
    expect(await readExactVisibility(seed.agentId)).toMatchObject([
        { messageId, servedRunId: runId },
    ]);
    expect((await readExactVisibility(seed.agentId))[0]?.seenAt).not.toBeNull();
});

test('settlement tolerates valid visibility whose pending row was already removed', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'removed after visibility', 1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'removed after visibility',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await connection.db.delete(agentInboxTable).where(eq(agentInboxTable.agentId, seed.agentId));

    await delivery.onTurnSettled(seed.computerId, {
        ...turnSummary(seed.agentId, runId, 'completed'),
        visibleMessages: [{ chatId: seed.chatId, id: messageId, sequence: 1 }],
    });

    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();
});

test('a bounded notice window always contains the newly unnoticed identity', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'initial',
        dedupeKey: 'msg-initial',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    for (let index = 0; index < 50; index += 1) {
        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: `backlog ${index}`,
            dedupeKey: `msg-backlog-${index}`,
            serverId: seed.serverId,
        });
    }
    const fullWindow = transport.framesOfType('notice').at(-1);
    await delivery.onNoticeAck({
        agentId: seed.agentId,
        workIds: fullWindow?.inbox.map((item) => item.id) ?? [],
        runId,
    });

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'newest',
        dedupeKey: 'msg-newest',
        serverId: seed.serverId,
    });

    expect(
        transport
            .framesOfType('notice')
            .at(-1)
            ?.inbox.map((item) => item.id)
    ).toContain('msg-newest');

    await delivery.onComputerReconnect(seed.computerId);
    const resentStart = transport.framesOfType('start').at(-1);
    expect(resentStart?.inbox.map((item) => item.id)).toEqual(['msg-initial']);
    await delivery.onAck({ agentId: seed.agentId, runId });
    expect(
        transport
            .framesOfType('notice')
            .at(-1)
            ?.inbox.map((item) => item.id)
    ).toContain('msg-newest');
});

test('accepts a repeated Computer-local visibility receipt after a committed receipt crash', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'local cache retry', 1);
    const oldHistoryId = await insertHumanMessage(seed, 'old history', 2);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'local cache retry',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const runner = {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    };
    const identities = [{ chatId: seed.chatId, id: messageId, sequence: 1 }];

    await expect(
        attestAgentEvents(connection.db, runner, [
            ...identities,
            { chatId: seed.chatId, id: oldHistoryId, sequence: 2 },
        ])
    ).resolves.toEqual({ accepted: [messageId, oldHistoryId] });
    await expect(attestAgentEvents(connection.db, runner, identities)).resolves.toEqual({
        accepted: [messageId],
    });
});

test('attests a multi-message Computer-local pull without wedging the transaction', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageIds = await Promise.all([
        insertHumanMessage(seed, 'task anchor one', 1),
        insertHumanMessage(seed, 'task anchor two', 2),
    ]);
    const threadChatId = `cht_thr_${messageIds[0]?.slice(4)}`;
    await connection.db.insert(chatsTable).values({
        anchorMessageId: messageIds[0],
        id: threadChatId,
        kind: 'thread',
        parentChatId: seed.chatId,
        serverId: seed.serverId,
    });
    const briefingId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: threadChatId,
        content: 'task thread briefing',
        id: briefingId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: seed.serverId,
    });
    messageIds.push(briefingId);
    await connection.db.insert(messageTasksTable).values([
        {
            assigneeAgentId: seed.agentId,
            chatId: seed.chatId,
            createdByUserId: seed.userId,
            messageId: messageIds[0] ?? '',
            number: 1,
            origin: 'composed',
            serverId: seed.serverId,
            status: 'todo',
        },
        {
            assigneeAgentId: seed.agentId,
            chatId: seed.chatId,
            createdByUserId: seed.userId,
            messageId: messageIds[1] ?? '',
            number: 2,
            origin: 'composed',
            serverId: seed.serverId,
            status: 'todo',
        },
    ]);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'task anchor one',
        dedupeKey: messageIds[0] ?? '',
        sequence: 1,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await connection.db.insert(agentInboxTable).values([
        {
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: 'task anchor two',
            dedupeKey: messageIds[1] ?? '',
            id: createOpaqueId('inb'),
            serverId: seed.serverId,
            source: 'human',
        },
        {
            agentId: seed.agentId,
            chatId: threadChatId,
            content: 'task thread briefing',
            dedupeKey: messageIds[2] ?? '',
            id: createOpaqueId('inb'),
            serverId: seed.serverId,
            source: 'human',
        },
    ]);
    const runner = {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    };

    await expect(
        attestAgentEvents(
            connection.db,
            runner,
            messageIds.map((id, index) => ({
                chatId: index === 2 ? threadChatId : seed.chatId,
                id,
                sequence: index === 2 ? 1 : index + 1,
            }))
        )
    ).resolves.toEqual({ accepted: messageIds });
});

test('reconnect replays busy work pulled by an unsettled active run', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const firstMessageId = await insertHumanMessage(seed, 'first', 1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'first',
        dedupeKey: firstMessageId,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const followUpMessageId = await insertHumanMessage(seed, 'pull then crash', 2);
    await connection.db.insert(messageTasksTable).values({
        assigneeAgentId: seed.agentId,
        chatId: seed.chatId,
        claimedAt: new Date(),
        createdByUserId: seed.userId,
        messageId: followUpMessageId,
        number: 1,
        origin: 'composed',
        serverId: seed.serverId,
        status: 'in_progress',
    });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'pull then crash',
        dedupeKey: followUpMessageId,
        serverId: seed.serverId,
    });
    await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });

    await delivery.onComputerReconnect(seed.computerId);

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.runId).toBe(runId);
    expect(starts[1]?.inbox.map((item) => item.content)).toEqual(['first', 'pull then crash']);
    expect(starts[1]?.inbox[1]?.task).toMatchObject({
        assigneeAgentId: seed.agentId,
        number: 1,
        status: 'in_progress',
    });
    expect(await countUnsettledPending(seed.agentId)).toBe(2);
    expect(await readExactVisibility(seed.agentId)).toMatchObject([
        { messageId: firstMessageId, seenAt: null, servedRunId: runId },
        { messageId: followUpMessageId, seenAt: null, servedRunId: runId },
    ]);
});

test('Stop persists across a restart, suppresses wakes, and keeps accumulating', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const generationBefore = await connection.db
        .select({ generation: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'live work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });
    const stops = transport.framesOfType('stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.runId).toBe(runId);
    const stopped = await readDeliveryState(connection.db, seed.agentId);
    expect(stopped?.stopped).toBe(true);
    expect(stopped?.activeRunId).toBeNull();

    // Stopped: new work accumulates and never dispatches.
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'while stopped',
        dedupeKey: 'msg-2',
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(2);

    // A fresh Server process (new orchestrator, same durable state) resumes.
    const restarted = new AgentDelivery(connection.db, transport);
    await restarted.start({ agentId: seed.agentId, serverId: seed.serverId });
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.inbox.map((item) => item.content)).toEqual(['live work', 'while stopped']);
    expect((await readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(false);
    const generationAfter = await connection.db
        .select({ generation: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(generationAfter).toEqual(generationBefore);
});

test('queues while the Computer is offline and redelivers on reconnect', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'buffered',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    // Offline: work stays queued; a run is created only once a Computer can
    // actually accept it, allowing one reconnect drain across all targets.
    expect(transport.sent).toHaveLength(0);
    const pending = await readDeliveryState(connection.db, seed.agentId);
    expect(pending?.activeRunId).toBeNull();

    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(1);
    expect(starts[0]?.runId).toBe(
        (await readDeliveryState(connection.db, seed.agentId))?.activeRunId
    );
});

test('repeated reconnects settle one durable result for one delivery', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'buffered once',
        dedupeKey: 'msg-reconnect-once',
        serverId: seed.serverId,
        source: 'onboarding',
    });

    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(3);
    expect(new Set(starts.map((frame) => frame.runId)).size).toBe(1);
    const runId = starts[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));
    await delivery.onComputerReconnect(seed.computerId);

    expect(transport.framesOfType('start')).toHaveLength(3);
    expect(await countTurns(seed.agentId)).toBe(1);
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
});

test('records a duplicate turn summary exactly once', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));

    expect(await countTurns(seed.agentId)).toBe(1);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();
});

test('reconnect resends an acknowledged in-flight run (Computer lost its turn)', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    // The Computer restarts mid-turn (accepted, never settled). Reconnect must
    // resend the same run so it is not stranded; the sweep alone would not.
    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(1);

    await delivery.onComputerReconnect(seed.computerId);
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.runId).toBe(runId);
});

test('a failed turn backs off instead of tight-looping', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'failed'));
    // No immediate re-drive, the work is requeued, and a backoff is scheduled.
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await countUnsettledPending(seed.agentId)).toBe(1);
    const state = await readDeliveryState(connection.db, seed.agentId);
    expect(state?.consecutiveFailures).toBe(1);
    expect(state?.retryAfter?.getTime()).toBeGreaterThan(Date.now());

    // The sweep respects the backoff window: no resend while retry_after is future.
    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('an expired backoff redrives and settles the queued work once', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'retry me',
        dedupeKey: 'msg-backoff-expiry',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const firstRunId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: firstRunId });
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, firstRunId, 'failed'));
    await connection.db
        .update(agentDeliveryTable)
        .set({ retryAfter: new Date(Date.now() - 1) })
        .where(eq(agentDeliveryTable.agentId, seed.agentId));

    await delivery.sweep();
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.runId).not.toBe(firstRunId);
    expect(starts[1]?.inbox.map((item) => item.content)).toEqual(['retry me']);

    const retryRunId = starts[1]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: retryRunId });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, retryRunId, 'completed')
    );
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, retryRunId, 'completed')
    );
    await delivery.sweep();

    expect(transport.framesOfType('start')).toHaveLength(2);
    expect(await countTurns(seed.agentId)).toBe(2);
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
});

test('an operator-action failure degrades immediately instead of spending retries', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-auth',
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, runId, 'failed', false, 'authentication')
    );

    const state = await readDeliveryState(connection.db, seed.agentId);
    expect(state?.consecutiveFailures).toBe(5);
    expect(state?.retryAfter).toBeNull();
    expect(await countUnsettledPending(seed.agentId)).toBe(1);
    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('a degraded Agent stops auto-retrying until fresh human intent', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    // Force a degraded row with queued work: many failures, no backoff window.
    await connection.db
        .insert(agentDeliveryTable)
        .values({ agentId: seed.agentId, consecutiveFailures: 99, serverId: seed.serverId });
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'stuck',
        dedupeKey: 'msg-1',
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'human',
    });

    // Degraded: the sweep will not auto-dispatch even with online, queued work.
    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(0);

    // A new human message clears the degrade and delivers.
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'retry please',
        dedupeKey: 'msg-2',
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect((await readDeliveryState(connection.db, seed.agentId))?.consecutiveFailures).toBe(0);
});

test('Restart clears a degraded Agent failure hold and redrives queued work', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await connection.db
        .insert(agentDeliveryTable)
        .values({ agentId: seed.agentId, consecutiveFailures: 5, serverId: seed.serverId });
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'retry after repair',
        dedupeKey: 'msg-restart-degraded',
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'human',
    });

    await delivery.restart({ agentId: seed.agentId, serverId: seed.serverId });

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(transport.framesOfType('start')[0]?.inbox.map((item) => item.content)).toEqual([
        'retry after repair',
    ]);
    expect((await readDeliveryState(connection.db, seed.agentId))?.consecutiveFailures).toBe(0);
});

test('a floating-session run drains queued work across every target', async () => {
    const seed = await seedAgent();
    const chatB = await addDmChat(seed);
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'from chat A',
        dedupeKey: 'a-1',
        serverId: seed.serverId,
    });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: chatB,
        content: 'from chat B',
        dedupeKey: 'b-1',
        serverId: seed.serverId,
    });

    expect(transport.framesOfType('start')).toHaveLength(0);
    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);
    const first = transport.framesOfType('start')[0];
    expect(first?.chatId).toBe(seed.chatId);
    expect(first?.inbox.map((item) => item.content)).toEqual(['from chat A', 'from chat B']);
    expect(first?.inbox.map((item) => item.chatId)).toEqual([seed.chatId, chatB]);
});

test('Stop revokes the run credential so it holds even without the socket', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const runnerId = createOpaqueId('arc');
    await connection.db.insert(agentRunnerCredentialsTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        id: runnerId,
        runId,
        serverId: seed.serverId,
        tokenHash: randomBytes(32).toString('hex'),
    });

    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });

    const [credential] = await connection.db
        .select({ revokedAt: agentRunnerCredentialsTable.revokedAt })
        .from(agentRunnerCredentialsTable)
        .where(eq(agentRunnerCredentialsTable.id, runnerId));
    expect(credential?.revokedAt).not.toBeNull();
});

test('Restart preserves the session generation and immediately redrives pending work', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'restart me',
        dedupeKey: 'msg-restart',
        serverId: seed.serverId,
    });
    const first = transport.framesOfType('start')[0];

    await delivery.restart({ agentId: seed.agentId, serverId: seed.serverId });

    expect(transport.framesOfType('stop')).toEqual([
        { agentId: seed.agentId, runId: first?.runId, type: 'stop' },
    ]);
    expect(transport.framesOfType('agent-restart')).toEqual([
        { agentId: seed.agentId, type: 'agent-restart' },
    ]);
    expect(transport.framesOfType('start')).toHaveLength(2);
    expect(transport.framesOfType('start')[1]?.runId).not.toBe(first?.runId);
    const [agent] = await connection.db
        .select({ generation: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(agent?.generation).toBe(1);
});

test('Restart resumes a stopped Agent and redrives its preserved inbox in the same session', async () => {
    const seed = await seedAgent();
    await insertHumanMessage(seed, 'restart me', 1);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'restart me',
        dedupeKey: 'msg-restart',
        serverId: seed.serverId,
    });
    const first = transport.framesOfType('start')[0];
    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });
    await delivery.restart({ agentId: seed.agentId, serverId: seed.serverId });

    expect((await readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(false);
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]?.runId).not.toBe(first?.runId);
    expect(starts[1]?.sessionGeneration).toBe(first?.sessionGeneration);
    expect(starts[1]?.inbox).toEqual(first?.inbox);
    expect(transport.framesOfType('agent-restart')).toEqual([
        { agentId: seed.agentId, type: 'agent-restart' },
    ]);
});

test('Restart fails without disturbing pending work when the assigned Computer is offline', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });

    await expect(
        delivery.restart({ agentId: seed.agentId, serverId: seed.serverId })
    ).rejects.toThrow('The assigned Computer must be online');
    expect(transport.sent).toEqual([]);
    expect((await readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(true);
    const [agent] = await connection.db
        .select({ generation: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(agent?.generation).toBe(1);
});

test('Restart keeps a stopped Agent paused when the Computer disconnects before the command', async () => {
    const seed = await seedAgent();
    class DisconnectedTransport extends FakeTransport {
        override send(): boolean {
            return false;
        }
    }
    const transport = new DisconnectedTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'restart me',
        dedupeKey: 'msg-restart-disconnected',
        serverId: seed.serverId,
    });

    await expect(
        delivery.restart({ agentId: seed.agentId, serverId: seed.serverId })
    ).rejects.toThrow('disconnected before the Agent could restart');
    expect((await readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(true);
    expect(await readDeliveryLedger(seed.agentId)).toEqual([
        expect.objectContaining({ dedupeKey: 'msg-restart-disconnected', state: 'queued' }),
    ]);
});

test('Reset rotates the session and tells the assigned Computer to clear local state', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'reset me',
        dedupeKey: 'msg-reset',
        serverId: seed.serverId,
    });
    const first = transport.framesOfType('start')[0];
    const runnerId = createOpaqueId('arc');
    await connection.db.insert(agentRunnerCredentialsTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        id: runnerId,
        runId: first?.runId ?? '',
        serverId: seed.serverId,
        tokenHash: randomBytes(32).toString('hex'),
    });

    await delivery.reset({ agentId: seed.agentId, kind: 'session', serverId: seed.serverId });

    expect(transport.framesOfType('stop')).toEqual([
        { agentId: seed.agentId, runId: first?.runId, type: 'stop' },
    ]);
    expect(transport.framesOfType('agent-reset')).toEqual([
        {
            agentId: seed.agentId,
            kind: 'session',
            sessionGeneration: 2,
            type: 'agent-reset',
        },
    ]);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(1);
    const [agent] = await connection.db
        .select({ generation: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(agent?.generation).toBe(2);
    const [credential] = await connection.db
        .select({ revokedAt: agentRunnerCredentialsTable.revokedAt })
        .from(agentRunnerCredentialsTable)
        .where(eq(agentRunnerCredentialsTable.id, runnerId));
    expect(credential?.revokedAt).not.toBeNull();
    // The reset is recorded as an Agent fact; the transcript stays untouched.
    expect(await readRotations(seed.agentId)).toEqual([{ generation: 2, reason: 'session' }]);
    expect(await readChatMessageContents(seed.chatId)).toEqual([]);
});

test('offline reset reconnects with authoritative configuration before redelivery', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'resume after reset',
        dedupeKey: 'msg-offline-reset',
        serverId: seed.serverId,
    });
    await delivery.reset({ agentId: seed.agentId, kind: 'full', serverId: seed.serverId });
    expect(transport.sent).toEqual([]);

    transport.online.add(seed.computerId);
    await delivery.onComputerReconnect(seed.computerId);

    expect(transport.sent.map(({ frame }) => frame.type)).toEqual(['agent-configure', 'start']);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        agentId: seed.agentId,
        sessionGeneration: 2,
        sessionResetKind: 'full',
    });
    expect(transport.framesOfType('start')[0]).toMatchObject({
        agentId: seed.agentId,
        sessionGeneration: 2,
    });
});

test('resume rejection rotates on the Server and retries from a fresh session', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'continue this work',
        dedupeKey: 'msg-resume-rejected',
        serverId: seed.serverId,
    });
    const firstRunId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, firstRunId, 'failed', false, 'session-resume')
    );

    expect(transport.sent.map(({ frame }) => frame.type)).toEqual([
        'start',
        'agent-configure',
        'start',
    ]);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        agentId: seed.agentId,
        sessionGeneration: 2,
        sessionResetKind: 'session',
    });
    const retry = transport.framesOfType('start')[1];
    expect(retry).toMatchObject({
        agentId: seed.agentId,
        inbox: [expect.objectContaining({ content: 'continue this work' })],
        sessionGeneration: 2,
    });
    expect(retry?.runId).not.toBe(firstRunId);
    expect(await readRotations(seed.agentId)).toEqual([{ generation: 2, reason: 'recovery' }]);
});

test('a failed turn that produced output does not requeue its work', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'do a thing',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    // The turn failed but already produced a durable send — requeuing would
    // re-trigger that output, so the work is dropped, not requeued or replayed.
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'failed', true));
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();
});

test('only a contiguous seen boundary subsumes queued work', async () => {
    const seed = await seedAgent();
    const messageId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: seed.chatId,
        content: 'pull then crash',
        id: messageId,
        nonce: createOpaqueId('nonce'),
        sequence: 1,
        serverId: seed.serverId,
    });
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'pull then crash',
        dedupeKey: messageId,
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'human',
    });
    await connection.db.insert(agentInboxCursorsTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        seenUpToSequence: 0,
        serverId: seed.serverId,
        sessionGeneration: 1,
    });

    await markCursorSubsumedSeen(connection.db, {
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    expect(await countUnsettledPending(seed.agentId)).toBe(1);

    await connection.db
        .update(agentInboxCursorsTable)
        .set({ seenUpToSequence: 1 })
        .where(eq(agentInboxCursorsTable.agentId, seed.agentId));
    await markCursorSubsumedSeen(connection.db, {
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
});

test('agent-only chain ceiling preserves work until human intent arrives', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await connection.db.insert(agentDeliveryTable).values({
        agentChainTurns: 16,
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'agent ping',
        dedupeKey: 'msg-agent-chain',
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'agent:wren',
    });

    await delivery.sweep();
    expect(transport.framesOfType('start')).toHaveLength(0);
    expect(await countUnsettledPending(seed.agentId)).toBe(1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'human reset',
        dedupeKey: 'msg-human-reset',
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(transport.framesOfType('start')[0]?.inbox).toHaveLength(2);
});

test('an output sent from agent-authored notice metadata still spends chain budget', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'agent ping',
        dedupeKey: 'msg-agent-notice-output',
        serverId: seed.serverId,
        source: 'agent:wren',
    });

    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, runId, 'completed', true)
    );

    expect((await readDeliveryState(connection.db, seed.agentId))?.agentChainTurns).toBe(1);
    expect(await countUnsettledPending(seed.agentId)).toBe(1);
});

test('a resent run stays frozen and the next delivery uses the changed runtime and model', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'work',
        dedupeKey: 'msg-1',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    expect(first).toMatchObject({ modelId: 'fake-model', runtimeId: 'fake' });
    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });

    // The Agent is reconfigured mid-flight; the in-flight run must not adopt it.
    await connection.db
        .update(agentsTable)
        .set({ desiredModelId: 'new-model', desiredRuntimeId: 'new-runtime' })
        .where(eq(agentsTable.id, seed.agentId));

    await delivery.onComputerReconnect(seed.computerId);
    const resent = transport.framesOfType('start')[1];
    expect(resent?.runId).toBe(first?.runId);
    expect(resent).toMatchObject({ modelId: 'fake-model', runtimeId: 'fake' });

    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, first?.runId ?? '', 'completed')
    );
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'next work',
        dedupeKey: 'msg-2',
        serverId: seed.serverId,
        source: 'onboarding',
    });

    const next = transport.framesOfType('start')[2];
    expect(next?.runId).not.toBe(first?.runId);
    expect(next).toMatchObject({ modelId: 'new-model', runtimeId: 'new-runtime' });
    expect(next?.inbox.map((item) => item.content)).toEqual(['next work']);
    expect(
        transport
            .framesOfType('start')
            .filter((frame) => frame.modelId === 'new-model' && frame.runtimeId === 'new-runtime')
    ).toHaveLength(1);
});

test('defers a public Agent configuration change until the active run settles', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const runnerId = createOpaqueId('arc');

    await connection.db
        .update(computersTable)
        .set({
            health: 'healthy',
            reportedInventory: {
                runtimes: [
                    {
                        id: 'fake',
                        label: 'Fake',
                        models: [
                            { id: 'fake-model', label: 'Fake model' },
                            { id: 'new-model', label: 'New model' },
                        ],
                    },
                ],
            },
        })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'finish this before switching models',
        dedupeKey: 'config-switch-active-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the active run to start.');
    }
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });
    await connection.db.insert(agentRunnerCredentialsTable).values({
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        id: runnerId,
        runId: first.runId,
        serverId: seed.serverId,
        tokenHash: randomBytes(32).toString('hex'),
    });

    const configured = await configureAgent(
        connection.db,
        {
            clerkUserId: 'config-switch-owner',
            id: seed.userId,
        },
        {
            agentId: seed.agentId,
            modelId: 'new-model',
            runtimeId: 'fake',
            serverId: seed.serverId,
        }
    );
    await delivery.applyAgentConfiguration(configured);

    expect(configured.agent).toMatchObject({ desiredModelId: 'new-model' });
    expect(transport.framesOfType('stop')).toEqual([]);
    expect(transport.framesOfType('agent-configure')).toEqual([]);
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(await readDeliveryState(connection.db, seed.agentId)).toMatchObject({
        activeRunId: first.runId,
        activeRunModelId: 'fake-model',
        activeRunRuntimeId: 'fake',
    });
    const [pendingBeforeSettlement] = await connection.db
        .select({ runId: agentInboxTable.runId, state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.dedupeKey, 'config-switch-active-run')
            )
        );
    // Concrete work is served the moment the run carrying its body is accepted.
    expect(pendingBeforeSettlement).toEqual({ runId: first.runId, state: 'served' });
    const [credentialBeforeSettlement] = await connection.db
        .select({ revokedAt: agentRunnerCredentialsTable.revokedAt })
        .from(agentRunnerCredentialsTable)
        .where(eq(agentRunnerCredentialsTable.id, runnerId));
    expect(credentialBeforeSettlement?.revokedAt).toBeNull();
    const [generationBeforeSettlement] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(generationBeforeSettlement?.sessionGeneration).toBe(1);
    expect(await readRotations(seed.agentId)).toEqual([]);
    const failedActivity = await connection.db
        .select({ phase: agentActivityTable.phase })
        .from(agentActivityTable)
        .where(
            and(
                eq(agentActivityTable.agentId, seed.agentId),
                eq(agentActivityTable.runId, first.runId),
                eq(agentActivityTable.phase, 'failed')
            )
        );
    expect(failedActivity).toEqual([]);

    await delivery.onComputerReconnect(seed.computerId);
    const replayed = transport.framesOfType('start')[1];
    expect(transport.framesOfType('agent-configure')).toEqual([]);
    expect(replayed).toMatchObject({
        modelId: 'fake-model',
        runtimeId: 'fake',
        sessionGeneration: 1,
        runId: first.runId,
    });

    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, first.runId, 'completed')
    );

    expect(transport.framesOfType('agent-configure')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
    const [rotated] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(rotated?.sessionGeneration).toBe(2);
    expect(await readRotations(seed.agentId)).toEqual([{ generation: 2, reason: 'configuration' }]);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'use the new model for this',
        dedupeKey: 'config-switch-next-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(3);
    expect(starts[2]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
});

test.each([
    'fake',
    'grok-build',
])('defers %s effort changes until settlement', async (runtimeId) => {
    const seed = await seedAgent(runtimeId);
    const expectedGeneration = runtimeId === 'grok-build' ? 2 : 1;
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await connection.db
        .update(computersTable)
        .set({
            health: 'healthy',
            reportedInventory: {
                runtimes: [
                    {
                        id: runtimeId,
                        label: 'Fake',
                        models: [{ id: 'fake-model', label: 'Fake model' }],
                    },
                ],
            },
        })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'finish this before changing effort',
        dedupeKey: 'effort-switch-active-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the active run to start.');
    }
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });

    const configured = await configureAgent(
        connection.db,
        {
            clerkUserId: 'effort-switch-owner',
            id: seed.userId,
        },
        {
            agentId: seed.agentId,
            modelId: 'fake-model',
            reasoningEffort: 'high',
            runtimeId,
            serverId: seed.serverId,
        }
    );
    await delivery.applyAgentConfiguration(configured);

    expect(configured.agent).toMatchObject({ desiredReasoningEffort: 'high' });
    expect(transport.framesOfType('stop')).toEqual([]);
    expect(transport.framesOfType('agent-configure')).toEqual([]);
    expect(await readRotations(seed.agentId)).toEqual([]);

    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, first.runId, 'completed')
    );

    expect(transport.framesOfType('agent-configure')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        modelId: 'fake-model',
        reasoningEffort: 'high',
        runtimeId,
        sessionGeneration: expectedGeneration,
    });
    const [generationAfterSettlement] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(generationAfterSettlement?.sessionGeneration).toBe(expectedGeneration);
});

test('applies deferred configuration at Stop without auto-starting, then starts explicitly', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await connection.db
        .update(computersTable)
        .set({
            health: 'healthy',
            reportedInventory: {
                runtimes: [
                    {
                        id: 'fake',
                        label: 'Fake',
                        models: [
                            { id: 'fake-model', label: 'Fake model' },
                            { id: 'new-model', label: 'New model' },
                        ],
                    },
                ],
            },
        })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'finish before stopping',
        dedupeKey: 'config-stop-active-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the active run to start.');
    }
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });

    const configured = await configureAgent(
        connection.db,
        {
            clerkUserId: 'config-stop-owner',
            id: seed.userId,
        },
        {
            agentId: seed.agentId,
            modelId: 'new-model',
            runtimeId: 'fake',
            serverId: seed.serverId,
        }
    );
    await delivery.applyAgentConfiguration(configured);

    await delivery.stop({ agentId: seed.agentId, serverId: seed.serverId });

    expect(transport.framesOfType('stop')).toEqual([
        { agentId: seed.agentId, runId: first.runId, type: 'stop' },
    ]);
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
    expect((await readDeliveryState(connection.db, seed.agentId))?.stopped).toBe(true);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();

    const [afterStop] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(afterStop?.sessionGeneration).toBe(2);

    await delivery.start({ agentId: seed.agentId, serverId: seed.serverId });

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
});

test('applies deferred configuration before Restart redrives pending work', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await connection.db
        .update(computersTable)
        .set({
            health: 'healthy',
            reportedInventory: {
                runtimes: [
                    {
                        id: 'fake',
                        label: 'Fake',
                        models: [
                            { id: 'fake-model', label: 'Fake model' },
                            { id: 'new-model', label: 'New model' },
                        ],
                    },
                ],
            },
        })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'finish before restarting',
        dedupeKey: 'config-restart-active-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the active run to start.');
    }
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });

    const configured = await configureAgent(
        connection.db,
        {
            clerkUserId: 'config-restart-owner',
            id: seed.userId,
        },
        {
            agentId: seed.agentId,
            modelId: 'new-model',
            runtimeId: 'fake',
            serverId: seed.serverId,
        }
    );
    await delivery.applyAgentConfiguration(configured);

    await delivery.restart({ agentId: seed.agentId, serverId: seed.serverId });

    expect(transport.framesOfType('stop')).toEqual([
        { agentId: seed.agentId, runId: first.runId, type: 'stop' },
    ]);
    expect(transport.framesOfType('agent-configure')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
    expect(transport.framesOfType('agent-restart')).toEqual([
        { agentId: seed.agentId, type: 'agent-restart' },
    ]);
    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
    });
    expect(starts[1]?.runId).not.toBe(first.runId);

    const [afterRestart] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(afterRestart?.sessionGeneration).toBe(2);
});

test('applies deferred configuration with one strongest Reset generation', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    await connection.db
        .update(computersTable)
        .set({
            health: 'healthy',
            reportedInventory: {
                runtimes: [
                    {
                        id: 'fake',
                        label: 'Fake',
                        models: [
                            { id: 'fake-model', label: 'Fake model' },
                            { id: 'new-model', label: 'New model' },
                        ],
                    },
                ],
            },
        })
        .where(eq(computersTable.id, seed.computerId));

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'finish before resetting',
        dedupeKey: 'config-reset-active-run',
        serverId: seed.serverId,
        source: 'onboarding',
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the active run to start.');
    }
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });

    const configured = await configureAgent(
        connection.db,
        {
            clerkUserId: 'config-reset-owner',
            id: seed.userId,
        },
        {
            agentId: seed.agentId,
            modelId: 'new-model',
            runtimeId: 'fake',
            serverId: seed.serverId,
        }
    );
    await delivery.applyAgentConfiguration(configured);

    await delivery.reset({ agentId: seed.agentId, kind: 'full', serverId: seed.serverId });

    expect(transport.sent.map(({ frame }) => frame.type)).toEqual([
        'start',
        'stop',
        'agent-configure',
        'agent-reset',
    ]);
    expect(transport.framesOfType('stop')).toEqual([
        { agentId: seed.agentId, runId: first.runId, type: 'stop' },
    ]);
    expect(transport.framesOfType('agent-reset')).toEqual([
        {
            agentId: seed.agentId,
            kind: 'full',
            sessionGeneration: 2,
            type: 'agent-reset',
        },
    ]);
    expect(transport.framesOfType('agent-configure')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')[0]).toMatchObject({
        modelId: 'new-model',
        runtimeId: 'fake',
        sessionGeneration: 2,
        sessionResetKind: 'full',
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();

    const [afterReset] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(afterReset?.sessionGeneration).toBe(2);
    expect(await readRotations(seed.agentId)).toEqual([{ generation: 2, reason: 'full' }]);
});

test('rotates deferred configuration when an empty notice run is retired', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'notice to retire', 2);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'notice to retire',
        dedupeKey: messageId,
        serverId: seed.serverId,
    });
    const first = transport.framesOfType('start')[0];
    if (!first) {
        throw new Error('Expected the notice run to start.');
    }
    expect(first.inboxDelivery).toBe('notice');
    await delivery.onAck({ agentId: seed.agentId, runId: first.runId });

    await connection.db
        .update(agentsTable)
        .set({ desiredModelId: 'new-model' })
        .where(eq(agentsTable.id, seed.agentId));
    await advanceSeenCursor(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        sequence: 2,
        serverId: seed.serverId,
    });

    // Reconnect reconstructs the old notice run after its only queued row has
    // been subsumed. The empty notice is a retired run boundary, not a reason
    // to launch a stale model or silently lose the desired configuration.
    await delivery.onComputerReconnect(seed.computerId);

    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(transport.framesOfType('agent-configure')).toMatchObject([
        {
            modelId: 'new-model',
            sessionGeneration: 2,
        },
    ]);
    expect((await readDeliveryState(connection.db, seed.agentId))?.activeRunId).toBeNull();
    expect(await readRotations(seed.agentId)).toEqual([{ generation: 2, reason: 'configuration' }]);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'next after empty notice',
        dedupeKey: 'after-empty-notice',
        serverId: seed.serverId,
    });

    const starts = transport.framesOfType('start');
    expect(starts).toHaveLength(2);
    expect(starts[1]).toMatchObject({
        modelId: 'new-model',
        sessionGeneration: 2,
    });
    expect(transport.sent.map(({ frame }) => frame.type)).toEqual([
        'start',
        'agent-configure',
        'start',
    ]);
    const [agent] = await connection.db
        .select({ sessionGeneration: agentsTable.sessionGeneration })
        .from(agentsTable)
        .where(eq(agentsTable.id, seed.agentId));
    expect(agent?.sessionGeneration).toBe(2);
});

test('bounds one drain and carries the overflow in a later run', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);

    // Three ~10k-char messages exceed the 24k drain budget, so the first run
    // carries two and the third waits for the next.
    const padding = 'x'.repeat(10_000);
    for (let index = 1; index <= 3; index += 1) {
        await connection.db.insert(agentInboxTable).values({
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: `msg-${index}-${padding}`,
            dedupeKey: `msg-${index}`,
            id: createOpaqueId('inb'),
            serverId: seed.serverId,
            source: 'onboarding',
        });
    }
    await connection.db
        .insert(agentDeliveryTable)
        .values({ agentId: seed.agentId, serverId: seed.serverId });

    await delivery.sweep();
    const first = transport.framesOfType('start')[0];
    expect(first?.inbox.map((item) => item.content.slice(0, 6))).toEqual(['msg-1-', 'msg-2-']);

    await delivery.onAck({ agentId: seed.agentId, runId: first?.runId ?? '' });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, first?.runId ?? '', 'completed')
    );
    const second = transport.framesOfType('start')[1];
    expect(second?.inbox.map((item) => item.content.slice(0, 6))).toEqual(['msg-3-']);
});

test('retains a settled delivery as proof the Agent read an FYI and answered nothing', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'fyi, the deploy finished', 1);

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'fyi, the deploy finished',
        dedupeKey: messageId,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });
    const served = await readDeliveryLedger(seed.agentId);
    expect(served).toMatchObject([{ dedupeKey: messageId, state: 'served' }]);
    expect(served[0]?.acceptedAt).not.toBeNull();

    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, runId, 'completed', false)
    );

    // The row is gone from the live queue but still readable as evidence.
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(0);
    expect(await countUnsettledPending(seed.agentId)).toBe(0);
    const ledger = await readDeliveryLedger(seed.agentId);
    expect(ledger).toMatchObject([{ dedupeKey: messageId, settledRunId: runId, state: 'seen' }]);
    expect(ledger[0]?.seenAt).not.toBeNull();

    const [turn] = await connection.db
        .select({
            failureKind: agentTurnsTable.failureKind,
            messageCount: agentTurnsTable.messageCount,
            outputProduced: agentTurnsTable.outputProduced,
            status: agentTurnsTable.status,
        })
        .from(agentTurnsTable)
        .where(eq(agentTurnsTable.runId, runId));
    expect(turn).toEqual({
        failureKind: null,
        messageCount: 0,
        outputProduced: false,
        status: 'completed',
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
});

test('exact visibility does not consume an unseen message across a gap', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const firstMessageId = await insertHumanMessage(seed, 'earlier note', 1);
    const secondMessageId = await insertHumanMessage(seed, 'later note', 2);

    for (const [index, messageId] of [firstMessageId, secondMessageId].entries()) {
        await delivery.deliver({
            agentId: seed.agentId,
            chatId: seed.chatId,
            content: index === 0 ? 'earlier note' : 'later note',
            dedupeKey: messageId,
            sequence: index + 1,
            serverId: seed.serverId,
        });
    }
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    // Only the later message is attested. Exact visibility must not imply that
    // the earlier message was seen.
    await attestAgentEvents(
        connection.db,
        {
            agentId: seed.agentId,
            chatId: seed.chatId,
            computerId: seed.computerId,
            runId,
            runnerId: createOpaqueId('arc'),
            serverId: seed.serverId,
        },
        [{ chatId: seed.chatId, id: secondMessageId, sequence: 2 }]
    );
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, runId, 'completed', false)
    );

    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(1);
    const ledger = await readDeliveryLedger(seed.agentId);
    expect(ledger).toHaveLength(2);
    expect(ledger.find((row) => row.dedupeKey === firstMessageId)).toMatchObject({
        settledRunId: null,
        state: 'queued',
    });
    expect(ledger.find((row) => row.dedupeKey === secondMessageId)).toMatchObject({
        settledRunId: runId,
        state: 'seen',
    });
});

test('wakes an idle Agent with the Trigger fire envelope already in its frame', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const fireId = createOpaqueId('trf');
    const envelope = `\u26a1 Trigger: nightly\nfire=${fireId}`;

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: envelope,
        createdAt: new Date(),
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'trigger',
    });

    // A fire exists nowhere but the inbox, so it rides the concrete lane: the
    // body is in the prompt the Agent wakes with, not behind a pull it may skip.
    const start = transport.framesOfType('start')[0];
    expect(start).toMatchObject({ inboxDelivery: 'concrete' });
    expect(start?.inbox.map((item) => item.id)).toEqual([fireId]);
    expect(start?.inbox[0]).toMatchObject({
        content: envelope,
        senderHandle: 'trigger',
        senderType: 'trigger',
    });
    expect(start?.totalPending).toBe(0);
    const runId = start?.runId ?? '';
    expect((await readDeliveryLedger(seed.agentId))[0]).toMatchObject({ state: 'accepted' });
    await delivery.onAck({ agentId: seed.agentId, runId });

    // Acceptance is the serve: the run's served set contains this fire, which
    // is what lets an unattributed answer infer its cause.
    const accepted = await readDeliveryLedger(seed.agentId);
    expect(accepted[0]).toMatchObject({ dedupeKey: fireId, state: 'served' });
    expect(accepted[0]?.servedAt).not.toBeNull();

    // Nothing is left for the pull to serve; the frame already carried it.
    const pulled = await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });
    expect(pulled.messages).toHaveLength(0);
    expect(pulled.automations).toHaveLength(0);

    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));

    const ledger = await readDeliveryLedger(seed.agentId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ dedupeKey: fireId, settledRunId: runId, state: 'seen' });
    expect(ledger[0]?.acceptedAt).not.toBeNull();
    expect(ledger[0]?.servedAt).not.toBeNull();
    expect(ledger[0]?.seenAt).not.toBeNull();
    expect(await countQueuedInboxItems(connection.db, seed.agentId)).toBe(0);

    // The next wake carries only the new work; a settled fire is never re-offered.
    const messageId = await insertHumanMessage(seed, 'anything new?', 1);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'anything new?',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    expect(transport.framesOfType('start')[1]?.inbox.map((item) => item.id)).toEqual([messageId]);

    // A reconnect resends the in-flight run without duplicating its work.
    await delivery.onComputerReconnect(seed.computerId);
    const resent = transport.framesOfType('start')[2];
    expect(resent?.runId).toBe(transport.framesOfType('start')[1]?.runId);
    expect(resent?.inbox.map((item) => item.id)).toEqual([messageId]);
    expect(await readDeliveryLedger(seed.agentId)).toHaveLength(2);
});

test('wakes an idle Agent concretely for a Reminder fire and a task assignment', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const fireId = createOpaqueId('rmf');
    const assignmentKey = 'task-assign:msg_assignment_concrete:1';

    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: `\ud83d\udd14 Reminder: Stand-up\nfire=${fireId}`,
        createdAt: new Date(),
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'reminder',
    });
    const reminderStart = transport.framesOfType('start')[0];
    expect(reminderStart).toMatchObject({ inboxDelivery: 'concrete' });
    expect(reminderStart?.inbox.map((item) => item.id)).toEqual([fireId]);
    expect(reminderStart?.inbox[0]).toMatchObject({
        content: `\ud83d\udd14 Reminder: Stand-up\nfire=${fireId}`,
        senderHandle: 'reminder',
        senderType: 'system',
    });

    const reminderRun = reminderStart?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId: reminderRun });

    // A second concrete kind never shares the fire's drain; it earns its own wake.
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'Assigned to you: #4 Ship the upload flow',
        dedupeKey: assignmentKey,
        mentioned: true,
        serverId: seed.serverId,
        source: 'task_assignment',
    });
    expect(transport.framesOfType('start')).toHaveLength(1);
    expect(transport.framesOfType('notice')[0]?.inbox.map((item) => item.id)).toEqual([
        assignmentKey,
    ]);
    await delivery.onNoticeAck({
        agentId: seed.agentId,
        runId: reminderRun,
        workIds: [assignmentKey],
    });
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, reminderRun, 'completed')
    );

    const assignmentStart = transport.framesOfType('start')[1];
    expect(assignmentStart).toMatchObject({ inboxDelivery: 'concrete' });
    expect(assignmentStart?.inbox.map((item) => item.id)).toEqual([assignmentKey]);
    expect(assignmentStart?.inbox[0]).toMatchObject({
        content: 'Assigned to you: #4 Ship the upload flow',
        mentioned: true,
        senderHandle: 'haus',
        senderType: 'system',
    });
    await delivery.onAck({ agentId: seed.agentId, runId: assignmentStart?.runId ?? '' });
    expect((await readDeliveryLedger(seed.agentId)).map((row) => row.state).sort()).toEqual([
        'seen',
        'served',
    ]);
});

test('re-drives a Trigger fire that arrived while the Agent was busy', async () => {
    const seed = await seedAgent();
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    const messageId = await insertHumanMessage(seed, 'look into the deploy', 1);
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: 'look into the deploy',
        dedupeKey: messageId,
        sequence: 1,
        serverId: seed.serverId,
    });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });

    const fireId = createOpaqueId('trf');
    await delivery.deliver({
        agentId: seed.agentId,
        chatId: seed.chatId,
        content: `\u26a1 Trigger: deploy\nfire=${fireId}`,
        createdAt: new Date(),
        dedupeKey: fireId,
        serverId: seed.serverId,
        source: 'trigger',
    });
    // A busy Agent is never interrupted with a body: the live turn gets only
    // the content-free notice, exactly as a committed action attention does.
    expect(transport.framesOfType('start')).toHaveLength(1);
    const notice = transport.framesOfType('notice')[0];
    expect(notice?.inbox.map((item) => item.id)).toEqual([messageId, fireId]);
    // The Computer acknowledges the busy notice for both identities.
    await delivery.onNoticeAck({ agentId: seed.agentId, runId, workIds: [messageId, fireId] });
    await delivery.onTurnSettled(seed.computerId, turnSummary(seed.agentId, runId, 'completed'));

    // The deferred Chat message stays deferred — it is still readable from
    // history — but the fire's envelope exists only in the queue, so it earns
    // its own concrete wake instead of being buried by the notice it missed.
    const next = transport.framesOfType('start')[1];
    expect(next).toMatchObject({ inboxDelivery: 'concrete' });
    expect(next?.inbox.map((item) => item.id)).toEqual([fireId]);
    expect(next?.runId).not.toBe(runId);
    await delivery.onAck({ agentId: seed.agentId, runId: next?.runId ?? '' });
    const pulled = await pullAgentEvents(connection.db, {
        agentId: seed.agentId,
        chatId: seed.chatId,
        computerId: seed.computerId,
        runId: next?.runId ?? '',
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    });
    // The fire is already model-visible; only the deferred Chat message is left
    // for a pull to serve.
    expect(pulled.automations).toHaveLength(0);
    expect(pulled.messages.map((row) => row.message.id)).toEqual([messageId]);
    await delivery.onTurnSettled(
        seed.computerId,
        turnSummary(seed.agentId, next?.runId ?? '', 'completed')
    );
    const ledger = await readDeliveryLedger(seed.agentId);
    expect(ledger.find((row) => row.dedupeKey === fireId)).toMatchObject({ state: 'seen' });
    expect(transport.framesOfType('start')).toHaveLength(2);
});
