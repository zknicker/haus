import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentThoughtEvent } from '@haus/api';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { subscribeToAgentThoughts } from '../src/agent-delivery/thought-events.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createAgentThoughts } from '../src/server-agents/agent-thought.ts';
import type { ThoughtSummary } from '../src/server-agents/agent-thought-summarizer.ts';
import {
    thoughtFirstSpacingMs,
    thoughtFloorMs,
    thoughtStillAfterMs,
} from '../src/server-agents/thought-cadence.ts';
import {
    collectBackground,
    fakeSummarizer,
    fakeTimers,
    pastThoughtGap,
    phrase,
} from './agent-thought-harness.ts';
import { wakeOn } from './chat-engagement-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// How a request's thoughts pace by workstream (ADR 0036), end to end through ingest.
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

test('shows a run’s first thought early, then holds later frames to the floor', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const answers: ThoughtSummary[] = [
        { kind: 'skip' },
        { kind: 'phrase', stream: 'new', text: 'Fetching the forecast' },
        { kind: 'phrase', stream: 'new', text: 'Comparing the weekend days' },
        { kind: 'phrase', stream: 'still', text: 'Checking the hourly rain odds' },
    ];
    const summarizer = fakeSummarizer(async () => answers.shift() ?? null);
    const clock = { now: 0 };
    const timers = fakeTimers(clock);
    const thoughts = createAgentThoughts({
        now: () => clock.now,
        schedule: timers.schedule,
        summarizer: summarizer.summarizer,
    });
    const background = collectBackground();
    const heard = listen();
    const ingest = async (step: number) => {
        timers.advance(step);
        await thoughts.ingest(
            connection.db,
            {
                computerId: seed.computerId,
                frame: phrase(seed.agentId, runner.runId),
                serverId: seed.serverId,
            },
            background
        );
        await Promise.all(background.tasks);
    };
    const wake = async (step: number) => {
        timers.advance(step);
        await Promise.all(background.tasks);
        await Bun.sleep(0);
    };
    // A skipped "Claiming the task" holds the work title behind it back a second at most.
    await ingest(0);
    await ingest(thoughtFirstSpacingMs - 1);
    expect(summarizer.seen).toHaveLength(1);
    await wake(1);
    expect(heard.texts()).toEqual(['Fetching the forecast']);
    // A frame inside the floor waits for it rather than being dropped.
    await ingest(thoughtFloorMs - 1);
    expect(summarizer.seen).toHaveLength(2);
    await wake(1);
    expect(heard.texts()).toEqual(['Fetching the forecast', 'Comparing the weekend days']);
    // A continuing line waits for a quiet stretch after the last bubble.
    await ingest(thoughtFloorMs);
    expect(heard.texts()).toHaveLength(2);
    await wake(thoughtStillAfterMs - thoughtFloorMs);
    expect(heard.texts().at(-1)).toBe('Still checking the hourly rain odds');
    heard.stop();
});

test('continues a line that rewords one already shown, and drops one about the machinery', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const answers: ThoughtSummary[] = [
        { kind: 'phrase', stream: 'new', text: 'Reading the Bun release notes' },
        { kind: 'phrase', stream: 'new', text: 'Scanning the Bun release notes' },
        { kind: 'phrase', stream: 'new', text: 'Filtering the three tags using jq' },
        { kind: 'phrase', stream: 'still', text: 'Skimming the Bun release notes' },
        { kind: 'phrase', stream: 'new', text: 'Comparing the three Bun releases' },
    ];
    const summarizer = fakeSummarizer(async () => answers.shift() ?? null);
    let clock = 0;
    const thoughts = createAgentThoughts({ now: () => clock, summarizer: summarizer.summarizer });
    const background = collectBackground();
    const heard = listen();
    for (let index = 0; index < 5; index += 1) {
        await thoughts.ingest(
            connection.db,
            {
                computerId: seed.computerId,
                frame: phrase(seed.agentId, runner.runId),
                serverId: seed.serverId,
            },
            background
        );
        await Promise.all(background.tasks);
        clock += pastThoughtGap;
    }
    await Bun.sleep(0);
    heard.stop();
    expect(heard.texts()).toEqual([
        'Reading the Bun release notes',
        'Still scanning the Bun release notes',
        'Comparing the three Bun releases',
    ]);
});

/** Collects every announced thought's text until stopped. */
function listen() {
    const heard: AgentThoughtEvent[] = [];
    const listening = new AbortController();
    void (async () => {
        for await (const event of subscribeToAgentThoughts(listening.signal)) {
            heard.push(event);
        }
    })().catch(() => undefined);
    return { stop: () => listening.abort(), texts: () => heard.map((event) => event.text) };
}
