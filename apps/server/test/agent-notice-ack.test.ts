import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentActivityEvent } from '@haus/api';
import { makeLifecycleLoggerLayer } from '@haus/effect';
import { and, eq } from 'drizzle-orm';
import { ManagedRuntime } from 'effect';
import { subscribeToCommittedAgentActivity } from '../src/agent-delivery/activity-events.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentActivityTable } from '../src/postgres/schema.ts';
import { deliverHuman, FakeTransport, seedAgent } from './agent-inbox-harness.ts';
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

test('a consumed notice ack logs one line with what it marked', async () => {
    const logs: unknown[][] = [];
    const logged = (...values: readonly unknown[]) => logs.push([...values]);
    const runtime = ManagedRuntime.make(
        makeLifecycleLoggerLayer({
            debug: logged,
            error: logged,
            info: logged,
            log: logged,
            trace: logged,
            warn: logged,
        })
    );
    try {
        const seed = await seedAgent(connection.db);
        const transport = new FakeTransport();
        transport.online.add(seed.computerId);
        const delivery = new AgentDelivery(connection.db, transport, runtime);
        await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
        const runId = transport.framesOfType('start')[0]?.runId ?? '';
        await delivery.onAck({ agentId: seed.agentId, runId });
        const busyMessage = await deliverHuman(connection.db, delivery, seed, {
            chatId: seed.dmChatId,
        });
        logs.length = 0;

        await delivery.onNoticeAck({ agentId: seed.agentId, runId, workIds: [busyMessage] });
        await delivery.onNoticeAck({
            agentId: seed.agentId,
            runId: 'run_stale',
            workIds: [busyMessage],
        });

        const acks = logs.filter(
            ([message]) => message === 'Agent notice acknowledgment consumed.'
        );
        expect(acks.map(([, fields]) => fields)).toEqual([
            {
                agentId: seed.agentId,
                event: 'inbox-notice-acked',
                noticedItems: 1,
                runId,
                workItems: 1,
            },
            // An ack for a run that is no longer accepted marks nothing.
            {
                agentId: seed.agentId,
                event: 'inbox-notice-acked',
                noticedItems: null,
                runId: 'run_stale',
                workItems: 1,
            },
        ]);
    } finally {
        await runtime.dispose();
    }
});

test('a consumed notice ack records one received_message activity for the run', async () => {
    const seed = await seedAgent(connection.db);
    const transport = new FakeTransport();
    transport.online.add(seed.computerId);
    const delivery = new AgentDelivery(connection.db, transport);
    await deliverHuman(connection.db, delivery, seed, { chatId: seed.dmChatId });
    const runId = transport.framesOfType('start')[0]?.runId ?? '';
    await delivery.onAck({ agentId: seed.agentId, runId });
    const busyMessage = await deliverHuman(connection.db, delivery, seed, {
        chatId: seed.dmChatId,
    });
    const published: AgentActivityEvent[] = [];
    const abort = new AbortController();
    const listening = (async () => {
        for await (const event of subscribeToCommittedAgentActivity(abort.signal)) {
            published.push(event);
        }
    })().catch(() => undefined);

    await delivery.onNoticeAck({ agentId: seed.agentId, runId, workIds: [busyMessage] });
    // A repeated ack names work this run already noticed, and a stale run marks nothing.
    await delivery.onNoticeAck({ agentId: seed.agentId, runId, workIds: [busyMessage] });
    await delivery.onNoticeAck({
        agentId: seed.agentId,
        runId: 'run_stale',
        workIds: [busyMessage],
    });
    abort.abort();
    await listening;

    const received = await connection.db
        .select()
        .from(agentActivityTable)
        .where(
            and(
                eq(agentActivityTable.agentId, seed.agentId),
                eq(agentActivityTable.category, 'received_message')
            )
        );
    expect(
        received.map(({ phase, producer, runId: row }) => ({ phase, producer, runId: row }))
    ).toEqual([{ phase: 'completed', producer: 'server', runId }]);
    expect(published.filter((event) => event.category === 'received_message')).toHaveLength(1);
});
