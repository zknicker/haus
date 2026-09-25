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
    thoughtSpacingMs,
} from '../src/server-agents/agent-thought.ts';
import type {
    ThoughtSource,
    ThoughtSummarizer,
    ThoughtSummary,
} from '../src/server-agents/agent-thought-summarizer.ts';
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

const at = '2026-09-24T12:00:00.000Z';
const excerpt = 'Let me compare the Halloween bids with last week before replying to the user.';

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
        { kind: 'phrase', text: 'Now checking Halloween bid changes' },
        { kind: 'phrase', text: "I'm comparing Halloween bids to last week" },
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
        clock += thoughtSpacingMs;
        return heard;
    };

    expect(await ingest(phrase(seed.agentId, runner.runId))).toEqual([
        'Now checking Halloween bid changes',
    ]);
    expect(await ingest(reasoning(seed.agentId, runner.runId))).toEqual([
        "I'm comparing Halloween bids to last week",
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
    expect(summarizer.seen).toEqual([
        { kind: 'title', title: 'Checking Halloween bid changes' },
        { kind: 'reasoning', reasoning: excerpt },
        { kind: 'title', title: 'Checking Halloween bid changes' },
        { kind: 'reasoning', reasoning: excerpt },
        { kind: 'title', title: 'Checking Halloween bid changes' },
        { kind: 'reasoning', reasoning: excerpt },
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

test('ignores a run’s titles and excerpts closer than the spacing window, before any summary', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const summarizer = fakeSummarizer(async () => ({ kind: 'phrase', text: 'Comparing bids' }));
    let clock = 0;
    const thoughts = createAgentThoughts({ now: () => clock, summarizer: summarizer.summarizer });
    const ingest = recorder(seed);

    expect(await ingest(thoughts, reasoning(seed.agentId, runner.runId))).toEqual([
        'Comparing bids',
    ]);
    clock += thoughtSpacingMs - 1;
    expect(await ingest(thoughts, reasoning(seed.agentId, runner.runId))).toEqual([]);
    // Titles are paid summarizer calls too, so the guard spaces them the same way.
    expect(await ingest(thoughts, phrase(seed.agentId, runner.runId))).toEqual([]);
    clock += 1;
    expect(await ingest(thoughts, phrase(seed.agentId, runner.runId))).toEqual(['Comparing bids']);
    expect(summarizer.seen).toHaveLength(2);
});

test('consumes but never summarizes a thought from the wrong Computer, and passes other frames on', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    await attestAgentEvents(connection.db, runner as never, [wakeMessage], { composed: true });
    const summarizer = fakeSummarizer(async () => ({ kind: 'phrase', text: 'Comparing bids' }));
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

function collectBackground() {
    const tasks: Promise<void>[] = [];
    return {
        run: (_operation: string, work: () => Promise<unknown>) => {
            const task = work().then(() => undefined);
            tasks.push(task);
            return task;
        },
        tasks,
    };
}

function fakeSummarizer(answer: (source: ThoughtSource) => Promise<ThoughtSummary | null>) {
    const seen: ThoughtSource[] = [];
    const summarizer: ThoughtSummarizer = {
        summarize: (source) => {
            seen.push(source);
            return answer(source);
        },
    };
    return { seen, summarizer };
}

function phrase(agentId: string, runId: string): AgentThoughtFrame {
    return {
        agentId,
        at,
        kind: 'phrase',
        runId,
        text: 'Checking Halloween bid changes',
        type: 'agent-thought',
    };
}

function reasoning(agentId: string, runId: string): AgentThoughtFrame {
    return { agentId, at, kind: 'reasoning', reasoning: excerpt, runId, type: 'agent-thought' };
}
