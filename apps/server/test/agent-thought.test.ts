import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentThoughtEvent, AgentThoughtFrame } from '@haus/api';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import {
    announceAgentThought,
    subscribeToAgentThoughts,
} from '../src/agent-delivery/thought-events.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    admitComputerAgentThought,
    createAgentThoughts,
} from '../src/server-agents/agent-thought.ts';
import type { ThoughtSummary } from '../src/server-agents/agent-thought-summarizer.ts';
import {
    at,
    collectBackground,
    excerpt,
    fakeSummarizer,
    pastThoughtGap,
    phrase,
    reasoning,
} from './agent-thought-harness.ts';
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
    expect(await admit(phrase(seed.agentId, runner.runId))).toEqual([]);

    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    expect(await admit(phrase(seed.agentId, runner.runId))).toEqual([
        {
            agentId: seed.agentId,
            at,
            chatId: seed.channelId,
            runId: runner.runId,
            serverId: seed.serverId,
        },
    ]);

    const wrong = [
        admit(phrase(seed.agentId, runner.runId), { computerId: createOpaqueId('cmp') }),
        admit(phrase(seed.agentId, runner.runId), { serverId: createOpaqueId('srv') }),
        admit(phrase(createOpaqueId('agt'), runner.runId)),
        admit(reasoning(seed.agentId, createOpaqueId('run'))),
    ];
    expect(await Promise.all(wrong)).toEqual([[], [], [], []]);

    await delivery.onTurnSettled(seed.computerId, settledSummary(seed.agentId, runner.runId));
    expect(await admit(phrase(seed.agentId, runner.runId))).toEqual([]);
});

test('rephrases titles and excerpts, drops SKIP, and falls back to the filtered heuristic', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const answers: (ThoughtSummary | null)[] = [
        { kind: 'phrase', stream: 'new', text: 'Pulling the deploy log' },
        { kind: 'phrase', stream: 'new', text: 'Comparing the two deploys' },
        { kind: 'skip' },
        { kind: 'skip' },
        null,
        null,
    ];
    const summarizer = fakeSummarizer(async () => answers.shift() ?? null);
    let clock = 0;
    const thoughts = createAgentThoughts({ now: () => clock, summarizer: summarizer.summarizer });
    const ingest = async (frame: AgentThoughtFrame) => {
        const heard = await recorder(seed)(thoughts, frame);
        clock += pastThoughtGap;
        return heard;
    };

    expect(await ingest(phrase(seed.agentId, runner.runId))).toEqual(['Pulling the deploy log']);
    expect(await ingest(reasoning(seed.agentId, runner.runId))).toEqual([
        'Comparing the two deploys',
    ]);
    // SKIP is final: no bubble, and no heuristic second opinion.
    expect(await ingest(phrase(seed.agentId, runner.runId))).toEqual([]);
    expect(await ingest(reasoning(seed.agentId, runner.runId))).toEqual([]);
    // A failed, late, or refused summary still shows the title or local condensation.
    expect(await ingest(phrase(seed.agentId, runner.runId))).toEqual([
        'Checking Halloween bid changes',
    ]);
    expect(await ingest(reasoning(seed.agentId, runner.runId))).toEqual([
        "I'm comparing the Halloween bids with last week",
    ]);
    // Every source carries the engaged human message as context.
    const request = 'Can you check the deploy?';
    const title = { kind: 'title', request, title: 'Checking Halloween bid changes' };
    const reasoned = { kind: 'reasoning', reasoning: excerpt, request };
    // After the first shown line, each source also carries the run's shown lines.
    const shown = ['Pulling the deploy log', 'Comparing the two deploys'];
    expect(summarizer.seen).toEqual([
        title,
        { ...reasoned, previous: shown.slice(0, 1) },
        { ...title, previous: shown },
        { ...reasoned, previous: shown },
        { ...title, previous: shown },
        { ...reasoned, previous: [...shown, 'Checking Halloween bid changes'] },
    ]);
});

test('without a key, shows the heuristic unless it is housekeeping', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const ingest = recorder(seed);

    expect(
        await ingest(
            createAgentThoughts({ summarizer: null }),
            reasoning(seed.agentId, runner.runId)
        )
    ).toEqual(["I'm comparing the Halloween bids with last week"]);
    expect(
        await ingest(createAgentThoughts({ summarizer: null }), {
            ...phrase(seed.agentId, runner.runId),
            text: "I'm reviewing memory notes",
        })
    ).toEqual([]);
    expect(
        await ingest(createAgentThoughts({ summarizer: null }), {
            ...reasoning(seed.agentId, runner.runId),
            reasoning:
                "I'm going to read my memory first before touching anything in this workspace.",
        })
    ).toEqual([]);
});

test('consumes but never summarizes a thought from the wrong Computer, and passes other frames on', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const summarizer = fakeSummarizer(async () => ({
        kind: 'phrase',
        stream: 'new',
        text: 'Comparing bids',
    }));
    const thoughts = createAgentThoughts({ summarizer: summarizer.summarizer });
    const background = collectBackground();
    const input = { computerId: createOpaqueId('cmp'), serverId: seed.serverId };

    expect(
        await thoughts.ingest(
            connection.db,
            { ...input, frame: reasoning(seed.agentId, runner.runId) },
            background
        )
    ).toBe(true);
    expect(
        await thoughts.ingest(
            connection.db,
            { ...input, frame: { ...phrase(seed.agentId, runner.runId), kind: undefined } },
            background
        )
    ).toBe(false);
    expect(background.tasks).toEqual([]);
    expect(summarizer.seen).toEqual([]);
});

test('announces thoughts live without replaying them to a later subscriber', async () => {
    const event = {
        agentId: 'agt_live',
        at,
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

/** Ingests one frame from the seeded Computer and returns the texts announced for it. */
function recorder(seed: { computerId: string; serverId: string }) {
    return async (thoughts: ReturnType<typeof createAgentThoughts>, frame: AgentThoughtFrame) => {
        const heard: AgentThoughtEvent[] = [];
        const listening = new AbortController();
        const listener = (async () => {
            for await (const event of subscribeToAgentThoughts(listening.signal)) {
                heard.push(event);
            }
        })().catch(() => undefined);
        const background = collectBackground();
        const consumed = await thoughts.ingest(
            connection.db,
            { computerId: seed.computerId, frame, serverId: seed.serverId },
            background
        );
        expect(consumed).toBe(true);
        await Promise.all(background.tasks);
        await Bun.sleep(0);
        listening.abort();
        await listener;
        return heard.map((event) => event.text);
    };
}
