import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentThoughtFrame } from '@haus/api';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import {
    announceAgentThought,
    subscribeToAgentThoughts,
} from '../src/agent-delivery/thought-events.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { admitComputerAgentThought } from '../src/server-agents/agent-thought.ts';
import { settledSummary, wakeOn } from './chat-engagement-harness.ts';
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

test('admits a thought for the accepted run, once per Chat it engages, and nowhere else', async () => {
    const { delivery, runner, seed, wakeMessage } = await wakeOn(connection.db);
    const admit = (
        frame: AgentThoughtFrame,
        overrides: { computerId?: string; serverId?: string } = {}
    ) =>
        admitComputerAgentThought(connection.db, {
            computerId: overrides.computerId ?? seed.computerId,
            frame,
            serverId: overrides.serverId ?? seed.serverId,
        });

    // Accepted but not yet engaged anywhere: there is no Chat to show it in.
    expect(await admit(thought(seed.agentId, runner.runId))).toEqual([]);

    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    expect(await admit(thought(seed.agentId, runner.runId))).toEqual([
        {
            agentId: seed.agentId,
            at: '2026-09-24T12:00:00.000Z',
            chatId: seed.channelId,
            runId: runner.runId,
            serverId: seed.serverId,
            text: 'Checking Halloween bid changes',
        },
    ]);

    const wrong = [
        admit(thought(seed.agentId, runner.runId), { computerId: createOpaqueId('cmp') }),
        admit(thought(seed.agentId, runner.runId), { serverId: createOpaqueId('srv') }),
        admit(thought(createOpaqueId('agt'), runner.runId)),
        admit(thought(seed.agentId, createOpaqueId('run'))),
    ];
    expect(await Promise.all(wrong)).toEqual([[], [], [], []]);

    await delivery.onTurnSettled(seed.computerId, settledSummary(seed.agentId, runner.runId));
    expect(await admit(thought(seed.agentId, runner.runId))).toEqual([]);
});

test('announces thoughts live without replaying them to a later subscriber', async () => {
    const event = {
        agentId: 'agt_live',
        at: '2026-09-24T12:00:00.000Z',
        chatId: 'cht_live',
        runId: 'run_live',
        serverId: 'srv_live',
        text: 'Reading the chart data',
    };
    const early = new AbortController();
    const iterator = subscribeToAgentThoughts(early.signal)[Symbol.asyncIterator]();
    const next = iterator.next();
    announceAgentThought(event);
    expect((await next).value).toEqual(event);
    early.abort();

    const late = new AbortController();
    const pending = subscribeToAgentThoughts(late.signal)[Symbol.asyncIterator]().next();
    const winner = await Promise.race([
        pending.then(() => 'replayed'),
        Bun.sleep(20).then(() => 'quiet'),
    ]);
    expect(winner).toBe('quiet');
    late.abort();
    await pending.catch(() => undefined);
});

function thought(agentId: string, runId: string): AgentThoughtFrame {
    return {
        agentId,
        at: '2026-09-24T12:00:00.000Z',
        runId,
        text: 'Checking Halloween bid changes',
        type: 'agent-thought',
    };
}
