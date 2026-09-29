import { afterAll, beforeAll, expect, test } from 'bun:test';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { subscribeToAgentThoughts } from '../src/agent-delivery/thought-events.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createAgentThoughts } from '../src/server-agents/agent-thought.ts';
import {
    createThoughtPreviousLines,
    thoughtPreviousLineTtlMs,
} from '../src/server-agents/thought-previous-lines.ts';
import {
    collectBackground,
    fakeSummarizer,
    pastThoughtGap,
    phrase,
} from './agent-thought-harness.ts';
import { post, wakeOn } from './chat-engagement-harness.ts';
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

test('sends the run’s shown lines in the Chat, only once one has shown', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const lines = ['Checking the deploy', 'Pulling the deploy log', 'Comparing the two runs'];
    const summarizer = fakeSummarizer(async () => {
        const text = lines[summarizer.seen.length - 1];
        return text ? { kind: 'phrase', stream: 'new', text } : { kind: 'skip' };
    });
    let clock = 0;
    const thoughts = createAgentThoughts({ now: () => clock, summarizer: summarizer.summarizer });
    for (let index = 0; index < 5; index += 1) {
        await ingest(thoughts, seed, phrase(seed.agentId, runner.runId));
        clock += pastThoughtGap;
    }

    expect(summarizer.seen.map((source) => source.previous)).toEqual([
        undefined,
        ['Checking the deploy'],
        ['Checking the deploy', 'Pulling the deploy log'],
        // A skipped thought showed nothing, so the shown lines stay.
        lines,
        lines,
    ]);
});

test('starts over for a message steered into the run, and keeps runs apart', async () => {
    const summarizer = fakeSummarizer(async (source) => ({
        kind: 'phrase',
        stream: 'new',
        text: source.previous?.length ? 'Reading staging health' : 'Pulling the deploy',
    }));
    let clock = 0;
    const thoughts = createAgentThoughts({ now: () => clock, summarizer: summarizer.summarizer });
    const first = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, first.runner as never, [first.wakeMessage], {
        composed: true,
    });
    await ingest(thoughts, first.seed, phrase(first.seed.agentId, first.runner.runId));
    // Well inside the gap after that line, which only binds the first request.
    clock += 5000;

    // The run starts engaging a DM too. That message is the run's newest request, so
    // both Chats start over: one phrase, no earlier lines, and a fresh cadence.
    const dm = await post(
        connection.db,
        first.seed,
        first.delivery,
        first.seed.dmChatId,
        'Also, is staging up?'
    );
    await attestAgentEvents(connection.db, first.runner as never, [dm], { composed: true });
    const heard = await ingest(
        thoughts,
        first.seed,
        phrase(first.seed.agentId, first.runner.runId)
    );
    expect(
        summarizer.seen
            .slice(1)
            .map((source) => source.previous?.join() ?? '(none)')
            .sort()
    ).toEqual(['(none)']);
    expect(heard.sort((a, b) => a.chatId.localeCompare(b.chatId))).toEqual(
        [
            { chatId: first.seed.dmChatId, text: 'Pulling the deploy' },
            { chatId: first.seed.channelId, text: 'Pulling the deploy' },
        ].sort((a, b) => a.chatId.localeCompare(b.chatId))
    );

    // Another run on the same Server starts with nothing to avoid.
    clock += pastThoughtGap;
    const other = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, other.runner as never, [other.wakeMessage], {
        composed: true,
    });
    await ingest(thoughts, other.seed, phrase(other.seed.agentId, other.runner.runId));
    expect(summarizer.seen.at(-1)?.previous).toBeUndefined();
});

test('keeps lines per request and forgets them after a long quiet stretch', () => {
    let clock = 0;
    const lines = createThoughtPreviousLines(() => clock);
    const scope = { chatId: 'cht_a', computerId: 'cmp_a', requestId: 'msg_a', runId: 'run_a' };
    lines.remember(scope, 'Checking the deploy');
    lines.remember(scope, 'Reading the log');
    lines.remember(scope, 'Comparing runs');
    lines.remember(scope, 'Weighing the fix');
    lines.remember(scope, 'Testing the fix');
    expect(lines.read(scope)).toEqual([
        'Reading the log',
        'Comparing runs',
        'Weighing the fix',
        'Testing the fix',
    ]);
    expect(lines.read({ ...scope, chatId: 'cht_b' })).toEqual([]);
    expect(lines.read({ ...scope, runId: 'run_b' })).toEqual([]);
    // A message steered into the running turn starts over.
    expect(lines.read({ ...scope, requestId: 'msg_b' })).toEqual([]);
    clock += thoughtPreviousLineTtlMs;
    expect(lines.read(scope)).toEqual([]);
});

/** Ingests one frame and returns each announced thought's Chat and text. */
async function ingest(
    thoughts: ReturnType<typeof createAgentThoughts>,
    seed: { computerId: string; serverId: string },
    frame: ReturnType<typeof phrase>
) {
    const heard: { chatId: string; text: string }[] = [];
    const listening = new AbortController();
    const listener = (async () => {
        for await (const event of subscribeToAgentThoughts(listening.signal)) {
            heard.push({ chatId: event.chatId, text: event.text });
        }
    })().catch(() => undefined);
    const background = collectBackground();
    await thoughts.ingest(
        connection.db,
        { computerId: seed.computerId, frame, serverId: seed.serverId },
        background
    );
    await Promise.all(background.tasks);
    await Bun.sleep(0);
    listening.abort();
    await listener;
    return heard;
}
