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
import { agentPost, post, settledSummary, wakeOn } from './chat-engagement-harness.ts';
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
    const run = await drive([
        { kind: 'skip' },
        { kind: 'phrase', stream: 'new', text: 'Fetching the forecast' },
        { kind: 'phrase', stream: 'new', text: 'Comparing the weekend days' },
        { kind: 'phrase', stream: 'still', text: 'Checking the hourly rain odds' },
    ]);
    const heard = listen();
    // A skipped "Claiming the task" holds the work title behind it back a second at most.
    await run.ingest(0);
    await run.ingest(thoughtFirstSpacingMs - 1);
    expect(run.summarizer.seen).toHaveLength(1);
    await run.wake(1);
    expect(heard.texts()).toEqual(['Fetching the forecast']);
    // A frame inside the floor waits for it rather than being dropped.
    await run.ingest(thoughtFloorMs - 1);
    expect(run.summarizer.seen).toHaveLength(2);
    await run.wake(1);
    expect(heard.texts()).toEqual(['Fetching the forecast', 'Comparing the weekend days']);
    // A continuing line waits for a quiet stretch after the last bubble.
    await run.ingest(thoughtFloorMs);
    expect(heard.texts()).toHaveLength(2);
    await run.wake(thoughtStillAfterMs - thoughtFloorMs);
    expect(heard.texts().at(-1)).toBe('Still checking the hourly rain odds');
    heard.stop();
});

test('a turn that settles drops its held line and never phrases its waiting frame', async () => {
    const run = await drive([
        { kind: 'phrase', stream: 'new', text: 'Fetching the forecast' },
        { kind: 'phrase', stream: 'still', text: 'Checking the hourly rain odds' },
        { kind: 'phrase', stream: 'new', text: 'Comparing the weekend days' },
    ]);
    const heard = listen();
    await run.ingest(0);
    await run.ingest(thoughtFloorMs);
    // Inside a second of the held line's phrasing, this frame waits.
    await run.ingest(0);
    expect(run.summarizer.seen).toHaveLength(2);
    await run.delivery.onTurnSettled(
        run.seed.computerId,
        settledSummary(run.seed.agentId, run.runner.runId)
    );
    await run.wake(thoughtStillAfterMs);
    heard.stop();
    expect(run.summarizer.seen).toHaveLength(2);
    expect(heard.texts()).toEqual(['Fetching the forecast']);
});

test('a summary still in flight when the run answers with --done announces nothing', async () => {
    const { promise: answer, resolve: release } = Promise.withResolvers<ThoughtSummary>();
    const run = await drive([], () => answer);
    const heard = listen();
    await run.ingest(0, { settle: false });
    while (run.summarizer.seen.length === 0) {
        await Bun.sleep(1);
    }
    await agentPost(connection.db, run.seed, run.seed.channelId, run.seed.agentId, {
        completesReply: true,
        runId: run.runner.runId,
    });
    release({ kind: 'phrase', stream: 'new', text: 'Fetching the forecast' });
    await run.wake(0);
    heard.stop();
    expect(heard.texts()).toEqual([]);
});

test('a steered message drops the held line of the request it supersedes', async () => {
    const run = await drive([
        { kind: 'phrase', stream: 'new', text: 'Fetching the forecast' },
        { kind: 'phrase', stream: 'still', text: 'Checking the hourly rain odds' },
        { kind: 'phrase', stream: 'new', text: 'Checking the staging deploy' },
    ]);
    const heard = listen();
    await run.ingest(0);
    await run.ingest(thoughtFloorMs);
    const steered = await post(
        connection.db,
        run.seed,
        run.delivery,
        run.seed.dmChatId,
        'Also, is staging up?'
    );
    await attestAgentEvents(connection.db, run.runner as never, [steered], { composed: true });
    // The new request's first line shows at once.
    await run.ingest(thoughtFirstSpacingMs);
    await run.wake(thoughtStillAfterMs);
    heard.stop();
    // The run now engages the channel and the DM, so the new line lands in both.
    expect(heard.texts()).toEqual([
        'Fetching the forecast',
        'Checking the staging deploy',
        'Checking the staging deploy',
    ]);
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

/** One accepted run's thoughts on a fake clock, with a summarizer answering in order. */
async function drive(
    answers: ThoughtSummary[],
    answer: () => Promise<ThoughtSummary | null> = async () => answers.shift() ?? null
) {
    const { delivery, runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const summarizer = fakeSummarizer(answer);
    const clock = { now: 0 };
    const timers = fakeTimers(clock);
    const thoughts = createAgentThoughts({
        now: () => clock.now,
        schedule: timers.schedule,
        summarizer: summarizer.summarizer,
    });
    const background = collectBackground();
    const wake = async (step: number) => {
        timers.advance(step);
        await Promise.all(background.tasks);
        await Bun.sleep(0);
    };
    const ingest = async (step: number, { settle = true } = {}) => {
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
        if (settle) {
            await Promise.all(background.tasks);
        }
    };
    return { delivery, ingest, runner, seed, summarizer, wake };
}

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
