import { afterEach, expect, test } from 'bun:test';
import { REMINDER_HISTORY_RETENTION_DAYS } from '@haus/api';
import { readAgentReminderLog } from '../src/agent-api/reminders.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
    reminderFiresTable,
    remindersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// `readAgentReminderLog` reads against the real clock (unlike scheduling and
// firing, which take an injected `ReminderClock`), because it bounds its
// query to `REMINDER_HISTORY_RETENTION_DAYS` of real wall-clock time —
// matching what retention sweep actually keeps — rather than fetching a
// reminder's entire fire history unbounded.

const serverId = 'srv_log';
const chatId = 'cht_log';
const agentId = 'agt_log';
const reminderId = 'rem_log';

let cluster: PostgresCluster | null = null;
let connection: HausConnection | null = null;

afterEach(async () => {
    await connection?.close();
    await cluster?.stop();
    connection = null;
    cluster = null;
});

test('bounds the fire history it reads to the retention window, by real time', async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    const db = connection.db;

    await db.insert(usersTable).values({ authSubject: 'cf_log', id: 'usr_log' });
    await db
        .insert(serversTable)
        .values({ displayName: 'Log Server', id: serverId, slug: 'log-server' });
    await db.insert(serverMembershipsTable).values({
        id: 'mem_log',
        role: 'owner',
        serverId,
        userId: 'usr_log',
    });
    await db.insert(chatsTable).values({
        id: chatId,
        isAll: true,
        kind: 'channel',
        lastMessageSequence: 1,
        name: 'all',
        serverId,
    });
    await db.insert(agentsTable).values({
        displayName: 'Cove',
        handle: 'log-cove',
        homeTimezone: 'America/New_York',
        id: agentId,
        serverId,
    });
    await db.insert(chatMessagesTable).values({
        authorAgentId: agentId,
        chatId,
        content: 'Anchor',
        createdAt: new Date(),
        id: 'msg_log',
        nonce: 'anchor',
        sequence: 1,
        serverId,
    });
    await db.insert(channelAgentParticipantsTable).values({ agentId, chatId, serverId });
    await db.insert(remindersTable).values({
        anchorChatId: chatId,
        anchorMessageId: 'msg_log',
        createdAt: new Date(),
        fireAt: new Date(Date.now() + 60 * 60 * 1000),
        id: reminderId,
        ownerAgentId: agentId,
        repeat: 'every:1h',
        script: 'check-disk',
        serverId,
        status: 'scheduled',
        timezone: 'America/New_York',
        title: 'Disk watchdog',
        updatedAt: new Date(),
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const fires = [
        { daysAgo: 1, id: 'rmf_recent' },
        { daysAgo: REMINDER_HISTORY_RETENTION_DAYS - 1, id: 'rmf_within_window' },
        { daysAgo: REMINDER_HISTORY_RETENTION_DAYS + 5, id: 'rmf_beyond_window' },
    ];
    for (const fire of fires) {
        const firedAt = new Date(now - fire.daysAgo * dayMs);
        await db.insert(reminderFiresTable).values({
            firedAt,
            hasScript: true,
            id: fire.id,
            outcome: 'woke',
            reminderId,
            scheduledFor: firedAt,
            scriptExitCode: 0,
            scriptOutput: 'ok',
            serverId,
        });
    }

    const log = await readAgentReminderLog(
        db,
        {
            agentId,
            capabilities: [],
            chatId,
            computerId: 'cmp_log',
            runId: 'run_log',
            runnerId: 'rnr_log',
            serverId,
        },
        { limit: 50 }
    );

    expect(log.runs.map((run) => run.id).sort()).toEqual(['rmf_recent', 'rmf_within_window']);
    expect(log.summary['30d'].runs).toBe(2);
    expect(log.summary['30d'].woke).toBe(2);
});
