import { afterAll, beforeAll, expect, test } from 'bun:test';
import { countStandingPreferencesAdded } from '../src/heartbeat/heartbeat-dream-facts.ts';
import { readAgentHeartbeats } from '../src/heartbeat/heartbeat-lanes.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    chatMessagesTable,
    remindersTable,
    serverMembershipsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import {
    fileReport,
    insertRun,
    insertTurn,
    reportMeter,
    useRuntime,
} from './agent-heartbeat-lanes-fixture.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';
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

const hour = 60 * 60 * 1000;
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * hour);

function read(seed: Seed, window: { from?: Date; to?: Date } = {}, userId = seed.userId) {
    return readAgentHeartbeats(
        connection.db,
        { clerkUserId: 'clerk', id: userId },
        {
            from: (window.from ?? at(24)).toISOString(),
            serverId: seed.serverId,
            to: (window.to ?? at(-1)).toISOString(),
        }
    );
}

async function lane(seed: Seed, window: { from?: Date; to?: Date } = {}) {
    const result = await read(seed, window);
    const [only] = result.lanes;
    return { marks: only?.marks ?? [], result, tokens: only?.tokens ?? 0 };
}
test('a dream carries its memory changes, summary line, follow-ups, and learned rules', async () => {
    const seed = await seedAgent(connection.db);
    const startedAt = at(8);
    const endedAt = new Date(startedAt.getTime() + 5 * 60_000);
    const runId = await insertRun(connection.db, seed, {
        endedAt,
        kind: 'nightly',
        startedAt,
        status: 'completed',
        tokens: 900,
    });
    const patch = [
        'diff --git a/MEMORY.md b/MEMORY.md',
        '--- a/MEMORY.md',
        '+++ b/MEMORY.md',
        '@@ -4,3 +4,5 @@ ## Standing Preferences',
        ' - Keep replies short.',
        '+- Lead with the answer.',
        '+- Name the file you changed.',
        '@@ -20,2 +22,3 @@ ## Active Context',
        '-- Waiting on budget.',
        '+- Budget approved.',
        '+- Launch Friday.',
        '',
    ].join('\n');
    await connection.db.insert(agentDreamsTable).values({
        agentId: seed.agentId,
        files: [{ added: 4, change: 'modified', path: 'MEMORY.md', removed: 1 }],
        finishedAt: endedAt,
        patch,
        runId,
        serverId: seed.serverId,
        startedAt,
    });
    await connection.db.insert(agentDreamSummariesTable).values({
        agentId: seed.agentId,
        runId,
        serverId: seed.serverId,
        summary: '\n- Learned to lead with the answer.\n- And to name files.',
    });
    const anchorId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: seed.channelId,
        content: 'anchor',
        id: anchorId,
        nonce: createOpaqueId('nonce'),
        sequence: 9_000_001,
        serverId: seed.serverId,
    });
    await connection.db.insert(remindersTable).values({
        anchorChatId: seed.channelId,
        anchorMessageId: anchorId,
        createdAt: new Date(startedAt.getTime() + 60_000),
        fireAt: at(-24),
        id: createOpaqueId('rem'),
        ownerAgentId: seed.agentId,
        serverId: seed.serverId,
        status: 'scheduled',
        timezone: 'UTC',
        title: 'Check the launch',
        updatedAt: startedAt,
    });

    const { marks, result } = await lane(seed);

    expect(marks[0]).toMatchObject({
        dream: {
            added: 4,
            followUpTitles: ['Check the launch'],
            followUps: 1,
            removed: 1,
            summary: '- Learned to lead with the answer.\n- And to name files.',
            summaryLine: 'Learned to lead with the answer.',
        },
        kind: 'nightly',
        outcome: 'quiet',
    });
    expect(result.summary).toMatchObject({ followUps: 1, rulesLearned: 2 });
    expect(countStandingPreferencesAdded(patch)).toBe(2);
    expect(countStandingPreferencesAdded('')).toBe(0);
});

test('a window includes its start, excludes its end, and holds only marks inside it', async () => {
    const seed = await seedAgent(connection.db);
    const from = at(10);
    const to = at(4);
    await insertRun(connection.db, seed, {
        startedAt: new Date(from.getTime() - 1),
        status: 'completed',
    });
    const atStart = await insertRun(connection.db, seed, { startedAt: from, status: 'completed' });
    const inside = await insertRun(connection.db, seed, { startedAt: at(7), status: 'completed' });
    await insertRun(connection.db, seed, { startedAt: to, status: 'completed' });

    const { marks } = await lane(seed, { from, to });

    expect(marks.map((mark) => mark.runId)).toEqual([atStart, inside]);
    expect((await lane(seed, { from: to, to: from })).marks).toEqual([]);
});

test('posted Chats are limited to those the viewer can see, and outsiders are refused', async () => {
    const seed = await seedAgent(connection.db);
    const colleagueId = createOpaqueId('usr');
    await connection.db
        .insert(usersTable)
        .values({ clerkUserId: createOpaqueId('clk'), id: colleagueId });
    await connection.db.insert(serverMembershipsTable).values({
        handle: 'colleague',
        id: createOpaqueId('mem'),
        role: 'member',
        serverId: seed.serverId,
        userId: colleagueId,
    });
    const runId = await insertRun(connection.db, seed, { startedAt: at(3), status: 'completed' });
    await fileReport(connection.db, seed, runId, 'Private news.', {
        chatId: seed.dmChatId,
        postedAt: at(2.9),
    });

    const owner = (await read(seed)).lanes[0]?.marks[0];
    const colleague = (await read(seed, {}, colleagueId)).lanes[0]?.marks[0];

    expect(owner?.report?.postedChatId).toBe(seed.dmChatId);
    expect(colleague?.report).toEqual({ postedChatId: null, text: 'Private news.' });
    await expect(read(seed, {}, createOpaqueId('usr'))).rejects.toThrow();
});

test('a plan splits its weekly meter by the week’s heartbeat and dream tokens', async () => {
    const seed = await seedAgent(connection.db);
    await useRuntime(connection.db, seed, 'codex');
    // The week began five days ago, so older turns do not count.
    await reportMeter(connection.db, seed, {
        resetsAt: new Date(now + 2 * 24 * hour),
        runtime: 'codex',
        usedPercent: 40,
    });
    await insertRun(connection.db, seed, {
        runtimeId: 'codex',
        startedAt: at(30),
        status: 'completed',
        tokens: 100,
    });
    await insertRun(connection.db, seed, {
        kind: 'nightly',
        runtimeId: 'codex',
        startedAt: at(20),
        status: 'completed',
        tokens: 200,
    });
    await insertRun(connection.db, seed, {
        runtimeId: 'codex',
        startedAt: at(10 * 24),
        status: 'completed',
        tokens: 9000,
    });
    await insertRun(connection.db, seed, {
        runtimeId: 'codex',
        startedAt: at(40),
        status: 'completed',
        tokens: 700,
    });
    // Ordinary work on the same plan: a turn with no heartbeat trigger.
    await insertTurn(connection.db, seed, {
        runId: createOpaqueId('run'),
        runtimeId: 'codex',
        startedAt: at(40),
        status: 'completed',
        tokens: 1000,
    });

    const { result } = await lane(seed, { from: at(100), to: at(-1) });

    // 40% of the week: heartbeats 800 and dreams 200 of 2000 tokens.
    expect(result.summary.plans).toEqual([
        {
            dreamPercent: 4,
            heartbeatPercent: 16,
            label: 'ChatGPT Pro',
            runtimeId: 'codex',
            usedPercent: 40,
        },
    ]);
});
