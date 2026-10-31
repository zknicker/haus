import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { seedDevelopmentHeartbeats } from '../src/development/seed-heartbeats.ts';
import { checkPlans, dreamPlans, heartbeatPlans } from '../src/development/seed-heartbeats-plan.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    agentRunTriggersTable,
    agentTurnsTable,
    chatMessagesTable,
} from '../src/postgres/schema.ts';
import { resolveAgentTurnTriggers } from '../src/server-agents/agent-turn-trigger-previews.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const subject = 'user_dev_heartbeats_owner';

let harness: HausServerHarness;
let database: HausConnection;
let serverId: string;
let userId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    await harness.humans.mintSessionToken(subject);
    userId = harness.humans.userIdForSubject(subject);
    serverId = (await seedDevelopmentServer(database.db, userId)).id;
});

afterAll(async () => {
    await database?.close();
    await harness?.close();
});

const readTriggers = () =>
    database.db
        .select()
        .from(agentRunTriggersTable)
        .where(eq(agentRunTriggersTable.serverId, serverId));

const readInbox = (source: string) =>
    database.db
        .select()
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.serverId, serverId), eq(agentInboxTable.source, source)));

test('the bootstrap seed writes every heartbeat state, and a refresh adds no duplicates', async () => {
    const refreshed = await seedDevelopmentHeartbeats(database.db, {
        refresh: true,
        serverId,
        userId,
    });
    const again = await seedDevelopmentHeartbeats(database.db, { serverId, userId });
    expect(refreshed.seeded).toBe(true);
    expect(again.seeded).toBe(false);

    // Triggers: one run per planned heartbeat and dream, plus a report run per report.
    const triggers = await readTriggers();
    const reportPlans = heartbeatPlans.filter((plan) => plan.report);
    const countOf = (source: string) => triggers.filter((row) => row.source === source).length;
    expect(countOf('heartbeat')).toBe(heartbeatPlans.length);
    expect(countOf('dream')).toBe(dreamPlans.length);
    expect(countOf('heartbeat_report')).toBe(reportPlans.length);
    expect(new Set(triggers.map((row) => row.runId)).size).toBe(triggers.length);

    // Turns: every run settled, and the failed heartbeat failed.
    const turns = await database.db
        .select()
        .from(agentTurnsTable)
        .where(eq(agentTurnsTable.serverId, serverId));
    const turnOf = new Map(turns.map((turn) => [turn.runId, turn]));
    const heartbeatTurns = triggers
        .filter((row) => row.source === 'heartbeat')
        .map((row) => turnOf.get(row.runId));
    expect(heartbeatTurns.every((turn) => turn !== undefined)).toBe(true);
    expect(heartbeatTurns.filter((turn) => turn?.status === 'failed')).toHaveLength(
        heartbeatPlans.filter((plan) => plan.outcome === 'failed').length
    );

    // Report inbox rows: one per report, keyed by the heartbeat's run.
    const reports = await readInbox('heartbeat_report');
    expect(reports).toHaveLength(reportPlans.length);
    expect(reports.every((row) => row.dedupeKey.startsWith('heartbeat-report:'))).toBe(true);

    // Posts: some reports were posted in #shop under the report run, one was only read.
    const posts = (
        await database.db
            .select({ runId: chatMessagesTable.runId })
            .from(chatMessagesTable)
            .where(eq(chatMessagesTable.serverId, serverId))
    ).filter((row) => row.runId !== null);
    expect(posts).toHaveLength(reportPlans.filter((plan) => plan.report?.post).length);

    // Dreams: a record per dream; a summary only where the Agent learned something.
    const dreams = await database.db
        .select()
        .from(agentDreamsTable)
        .where(eq(agentDreamsTable.serverId, serverId));
    const summaries = await database.db
        .select()
        .from(agentDreamSummariesTable)
        .where(eq(agentDreamSummariesTable.serverId, serverId));
    expect(dreams).toHaveLength(dreamPlans.length);
    expect(summaries).toHaveLength(dreamPlans.filter((plan) => plan.lessons.length > 0).length);

    // Checks: the skipped and paused slots, and the yielded run's stop.
    const checks = await database.db
        .select()
        .from(agentHeartbeatChecksTable)
        .where(eq(agentHeartbeatChecksTable.serverId, serverId));
    for (const outcome of ['skipped', 'paused'] as const) {
        expect(checks.filter((row) => row.outcome === outcome)).toHaveLength(
            checkPlans.filter((plan) => plan.outcome === outcome).length
        );
    }
    expect(checks.filter((row) => row.outcome === 'yielded')).toHaveLength(
        heartbeatPlans.filter((plan) => plan.outcome === 'yielded').length
    );
});

test('the seeded runs resolve to the outcomes the Log shows', async () => {
    const triggers = await readTriggers();
    const resolved = await resolveAgentTurnTriggers(
        database.db,
        { serverId, userId },
        triggers.map((row) => ({
            chatId: row.chatId,
            runId: row.runId,
            source: row.source,
            visible: false,
            workId: row.workId,
        }))
    );
    const heartbeats = resolved.filter((trigger) => trigger?.kind === 'heartbeat');
    const reported = heartbeats.filter((trigger) => trigger.report !== null);
    expect(reported).toHaveLength(heartbeatPlans.filter((plan) => plan.report).length);
    expect(reported.filter((trigger) => trigger.report?.postedChatId)).toHaveLength(
        heartbeatPlans.filter((plan) => plan.report?.post).length
    );
    expect(heartbeats.filter((trigger) => trigger.yielded)).toHaveLength(
        heartbeatPlans.filter((plan) => plan.outcome === 'yielded').length
    );

    const dreams = resolved.filter((trigger) => trigger?.kind === 'dream');
    expect(dreams.filter((trigger) => trigger.learned !== null)).toHaveLength(
        dreamPlans.filter((plan) => plan.lessons.length > 0).length
    );
    expect(dreams.some((trigger) => trigger.added > 0)).toBe(true);
    expect(
        dreams.some((trigger) => trigger.learned === null && trigger.added + trigger.removed === 0)
    ).toBe(true);
});

test('a refresh replaces the seed’s rows in place', async () => {
    const before = (await readTriggers()).length;
    await seedDevelopmentHeartbeats(database.db, { refresh: true, serverId, userId });
    await seedDevelopmentHeartbeats(database.db, { refresh: true, serverId, userId });

    const triggers = await readTriggers();
    const messages = await database.db
        .select({ nonce: chatMessagesTable.nonce })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.serverId, serverId));
    expect(triggers).toHaveLength(before);
    expect(new Set(triggers.map((row) => row.runId)).size).toBe(triggers.length);
    expect(messages.filter((row) => row.nonce === 'dev-hb-owner-context')).toHaveLength(1);
});
