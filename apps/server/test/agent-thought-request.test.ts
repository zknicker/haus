import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentThoughtFrame } from '@haus/api';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createAgentThoughts } from '../src/server-agents/agent-thought.ts';
import { collectBackground, fakeSummarizer, phrase } from './agent-thought-harness.ts';
import { agentPost, post, wakeOn } from './chat-engagement-harness.ts';
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

test('phrases a thought against the engaged human message, scrubbed', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(
        connection.db,
        '[@Orbit](agent://agt_orbit) can you check the deploy? cc ops@example.com'
    );
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });

    expect(await requestsFor(seed, phrase(seed.agentId, runner.runId))).toEqual([
        '@Orbit can you check the deploy? cc',
    ]);
});

test('uses the newest engaged message across Chats, and drops a Chat once answered', async () => {
    const { delivery, runner, seed, wakeMessage } = await wakeOn(connection.db);
    const dm = await post(connection.db, seed, delivery, seed.dmChatId, 'Also, is staging up?');
    await attestAgentEvents(connection.db, runner as never, [wakeMessage, dm], {
        composed: true,
    });
    expect(await requestsFor(seed, phrase(seed.agentId, runner.runId))).toEqual([
        'Also, is staging up?',
    ]);

    // The run's `--done` in the DM ends that engagement; the channel request remains.
    await agentPost(connection.db, seed, seed.dmChatId, seed.agentId, {
        completesReply: true,
        runId: runner.runId,
    });
    expect(await requestsFor(seed, phrase(seed.agentId, runner.runId))).toEqual([
        'Can you check the deploy?',
    ]);
});

/** Ingests one frame with a fresh summarizer and returns the request each summary saw. */
async function requestsFor(
    seed: { computerId: string; serverId: string },
    frame: AgentThoughtFrame
) {
    const summarizer = fakeSummarizer(async () => ({ kind: 'phrase', text: 'Checking' }));
    const thoughts = createAgentThoughts({ summarizer: summarizer.summarizer });
    const background = collectBackground();
    await thoughts.ingest(
        connection.db,
        { computerId: seed.computerId, frame, serverId: seed.serverId },
        background
    );
    await Promise.all(background.tasks);
    return summarizer.seen.map((source) => source.request);
}
