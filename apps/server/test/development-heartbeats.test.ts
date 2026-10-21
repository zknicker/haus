import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentHeartbeats, HeartbeatMark } from '@haus/api';
import { eq } from 'drizzle-orm';
import { seedDevelopmentHeartbeats } from '../src/development/seed-heartbeats.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { readAgentHeartbeats } from '../src/heartbeat/heartbeat-lanes.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentRunTriggersTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { ensureUserByClerkId } from '../src/users/haus-user.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const clerkUserId = 'user_dev_heartbeats_owner';
const day = 24 * 60 * 60 * 1000;

let harness: HausServerHarness;
let database: HausConnection;
let serverId: string;
let userId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    serverId = (await seedDevelopmentServer(database.db, clerkUserId)).id;
    userId = (await ensureUserByClerkId(database.db, clerkUserId)).id;
});

afterAll(async () => {
    await database?.close();
    await harness?.close();
});

async function readFeed(): Promise<AgentHeartbeats> {
    const now = Date.now();
    return await readAgentHeartbeats(
        database.db,
        { clerkUserId, id: userId },
        {
            from: new Date(now - 2 * day).toISOString(),
            serverId,
            to: new Date(now + 60_000).toISOString(),
        }
    );
}

function marksOf(feed: AgentHeartbeats): HeartbeatMark[] {
    return feed.lanes.flatMap((lane) => lane.marks);
}

test('the bootstrap seed shows every heartbeat state, and a refresh adds no duplicates', async () => {
    const refreshed = await seedDevelopmentHeartbeats(database.db, {
        refresh: true,
        serverId,
        userId,
    });
    const again = await seedDevelopmentHeartbeats(database.db, { serverId, userId });
    expect(refreshed.seeded).toBe(true);
    expect(again.seeded).toBe(false);

    const feed = await readFeed();
    const marks = marksOf(feed);
    expect(new Set(marks.map((mark) => mark.runId ?? mark.at)).size).toBe(marks.length);

    const reported = marks.filter((mark) => mark.outcome === 'reported');
    const posted = reported.filter((mark) => mark.report?.postedChatId);
    expect(posted.length).toBeGreaterThanOrEqual(2);
    expect(reported.filter((mark) => mark.report && !mark.report.postedChatId)).toHaveLength(1);
    expect(posted.some((mark) => (mark.report?.text.split('\n\n').length ?? 0) >= 2)).toBe(true);

    const dreams = marks.filter((mark) => mark.kind === 'nightly');
    expect(
        dreams.some(
            (mark) =>
                mark.dream?.summary?.includes('\n- ') &&
                mark.dream.followUps === 1 &&
                mark.dream.added > 0
        )
    ).toBe(true);
    expect(
        dreams.some((mark) => mark.dream?.summary === null && (mark.dream?.added ?? 0) > 0)
    ).toBe(true);
    expect(
        dreams.some(
            (mark) =>
                mark.dream?.summary === null && mark.dream.added === 0 && mark.dream.removed === 0
        )
    ).toBe(true);

    for (const outcome of ['failed', 'quiet', 'yielded', 'skipped', 'paused'] as const) {
        expect(marks.some((mark) => mark.outcome === outcome)).toBe(true);
    }
    expect(feed.summary.rulesLearned).toBeGreaterThanOrEqual(3);
    expect(marks.every((mark) => mark.tokens === null || mark.tokens > 0)).toBe(true);
});

test('a refresh replaces the seed’s rows in place', async () => {
    const before = marksOf(await readFeed()).length;
    await seedDevelopmentHeartbeats(database.db, { refresh: true, serverId, userId });
    await seedDevelopmentHeartbeats(database.db, { refresh: true, serverId, userId });

    expect(marksOf(await readFeed())).toHaveLength(before);
    const triggers = await database.db
        .select({ runId: agentRunTriggersTable.runId })
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.serverId, serverId));
    const messages = await database.db
        .select({ nonce: chatMessagesTable.nonce })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.serverId, serverId));
    expect(new Set(triggers.map((row) => row.runId)).size).toBe(triggers.length);
    expect(messages.filter((row) => row.nonce === 'dev-hb-owner-context')).toHaveLength(1);
});
