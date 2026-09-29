import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentThoughtEvent, AgentThoughtFrame } from '@haus/api';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { subscribeToAgentThoughts } from '../src/agent-delivery/thought-events.ts';
import { ingestAgentRunFrame } from '../src/computers/ingest-agent-run-frame.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createAgentThoughts } from '../src/server-agents/agent-thought.ts';
import type { ThoughtSummarizer } from '../src/server-agents/agent-thought-summarizer.ts';
import { at, collectBackground, fakeSummarizer } from './agent-thought-harness.ts';
import { wakeOn } from './chat-engagement-harness.ts';
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

function action(agentId: string, runId: string): AgentThoughtFrame {
    return {
        action: 'curl -fsS api.open-meteo.com/v1/forecast',
        agentId,
        at,
        kind: 'action',
        runId,
        type: 'agent-thought',
    };
}

test('phrases an action against the request through the summarizer, and drops SKIP', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db, 'Weather in NYC?');
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const answers = [
        { kind: 'phrase', stream: 'new', text: 'Pulling the NYC weather' },
        { kind: 'skip' },
    ] as const;
    const summarizer = fakeSummarizer(async () => answers[summarizer.seen.length - 1] ?? null);

    expect(await heard(seed, summarizer.summarizer, action(seed.agentId, runner.runId))).toEqual([
        'Pulling the NYC weather',
    ]);
    expect(await heard(seed, summarizer.summarizer, action(seed.agentId, runner.runId))).toEqual(
        []
    );
    expect(summarizer.seen[0]).toEqual({
        action: 'curl -fsS api.open-meteo.com/v1/forecast',
        kind: 'action',
        request: 'Weather in NYC?',
    });
});

test('sends a finished action’s result excerpt to the summarizer for that call only', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db, 'Chicago this weekend?');
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const summarizer = fakeSummarizer(async () => ({
        kind: 'phrase',
        stream: 'new',
        text: "Saturday looks wet, Sunday's clearer",
    }));
    const result = 'Saturday: rain likely, high 58\nSunday: sunny, high 66';
    expect(
        await heard(seed, summarizer.summarizer, { ...action(seed.agentId, runner.runId), result })
    ).toEqual(["Saturday looks wet, Sunday's clearer"]);
    expect(summarizer.seen).toEqual([
        {
            action: 'curl -fsS api.open-meteo.com/v1/forecast',
            kind: 'action',
            request: 'Chicago this weekend?',
            result,
        },
    ]);
    // Without a summarizer, a result is never shown or condensed.
    expect(await heard(seed, null, { ...action(seed.agentId, runner.runId), result })).toEqual([]);
});

test('shows nothing for an action when there is no summary to phrase it', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    expect(await heard(seed, null, action(seed.agentId, runner.runId))).toEqual([]);
    const failing = fakeSummarizer(async () => null);
    expect(await heard(seed, failing.summarizer, action(seed.agentId, runner.runId))).toEqual([]);
    expect(failing.seen).toHaveLength(1);
});

test('passes a thought frame of a kind it does not know on, without error', async () => {
    const { runner, seed } = await wakeOn(connection.db);
    const summarizer = fakeSummarizer(async () => ({ kind: 'phrase', stream: 'new', text: 'x' }));
    const background = collectBackground();
    const consumed = await ingestAgentRunFrame(
        connection.db,
        {
            computerId: seed.computerId,
            frame: { ...action(seed.agentId, runner.runId), kind: 'gesture' },
            serverId: seed.serverId,
        },
        createAgentThoughts({ summarizer: summarizer.summarizer }),
        background
    );
    expect(consumed).toBe(false);
    expect(background.tasks).toEqual([]);
    expect(summarizer.seen).toEqual([]);
});

/** Ingests one frame with a fresh thought pipeline and returns the texts announced for it. */
async function heard(
    seed: { computerId: string; serverId: string },
    summarizer: ThoughtSummarizer | null,
    frame: AgentThoughtFrame
) {
    const events: AgentThoughtEvent[] = [];
    const listening = new AbortController();
    const listener = (async () => {
        for await (const event of subscribeToAgentThoughts(listening.signal)) {
            events.push(event);
        }
    })().catch(() => undefined);
    const background = collectBackground();
    await createAgentThoughts({ summarizer }).ingest(
        connection.db,
        { computerId: seed.computerId, frame, serverId: seed.serverId },
        background
    );
    await Promise.all(background.tasks);
    await Bun.sleep(0);
    listening.abort();
    await listener;
    return events.map((event) => event.text);
}
