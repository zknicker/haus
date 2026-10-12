import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentLifecycleEvent, ChatEngagementEvent } from '@haus/api';
import { pullAgentEvents } from '../src/agent-api/inbox.ts';
import { readChatEngagements } from '../src/agent-delivery/chat-engagement.ts';
import {
    announceRunEngagements,
    installChatEngagementProjector,
    subscribeToChatEngagements,
} from '../src/agent-delivery/chat-engagement-events.ts';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { requestDream } from './agent-dream-fixture.ts';
import { offlineDelivery, seedAgent } from './agent-inbox-harness.ts';
import { post, settledSummary } from './chat-engagement-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;
let uninstall: () => void;
let stopLifecycle: () => void;
const settleWork: Promise<unknown>[] = [];
const engagements: ChatEngagementEvent[] = [];
const lifecycle: AgentLifecycleEvent[] = [];
const feed = new AbortController();

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    uninstall = installChatEngagementProjector(connection.db, {
        run: (_operation, work) => {
            const task = work().then(() => undefined);
            settleWork.push(task);
            return task;
        },
    });
    stopLifecycle = onAgentLifecycle((event) => lifecycle.push(event));
    void (async () => {
        for await (const event of subscribeToChatEngagements(feed.signal)) {
            engagements.push(event);
        }
    })().catch(() => undefined);
});

afterAll(async () => {
    feed.abort();
    uninstall?.();
    stopLifecycle?.();
    await connection?.close();
    await cluster?.stop();
});

async function drained() {
    await Promise.all(settleWork);
    await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a dream run publishes chatless lifecycle and its settlement ends the Chats it engaged', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, transport } = offlineDelivery(connection.db, seed);
    transport.online.add(seed.computerId);
    expect(await requestDream(connection.db, delivery, seed)).toBe(true);
    const runId = transport.framesOfType('start').at(-1)?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const runner = {
        agentId: seed.agentId,
        capabilities: [],
        chatId: null,
        computerId: seed.computerId,
        runId,
        runnerId: createOpaqueId('arc'),
        serverId: seed.serverId,
    };

    // A DM lands during the dream, and the Agent reads it in that turn.
    const news = await post(connection.db, seed, delivery, seed.dmChatId, 'Are you up?');
    const pulled = await pullAgentEvents(connection.db, runner);
    expect(pulled.messages.map((row) => row.message.id)).toContain(news.id);
    await announceRunEngagements(connection.db, runner);
    await drained();

    await delivery.onTurnSettled(seed.computerId, settledSummary(seed.agentId, runId));
    await drained();

    const runEvents = lifecycle.filter((event) => event.runId === runId);
    expect(runEvents.map((event) => [event.phase, event.chatId])).toEqual([
        ['working', null],
        ['reading', null],
        ['settled', null],
    ]);
    expect(
        engagements
            .filter((event) => event.runId === runId)
            .map((event) => [event.type, event.chatId])
    ).toEqual([
        ['chat.engagement.started', seed.dmChatId],
        ['chat.engagement.ended', seed.dmChatId],
    ]);
    expect(
        await readChatEngagements(connection.db, { chatId: seed.dmChatId, serverId: seed.serverId })
    ).toEqual([]);
});
