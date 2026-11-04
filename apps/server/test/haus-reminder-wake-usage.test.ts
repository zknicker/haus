import { afterEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentRunTriggersTable,
    agentsTable,
    chatMessagesTable,
    chatsTable,
    reminderFiresTable,
    remindersTable,
    serversTable,
} from '../src/postgres/schema.ts';
import { recordReminderWakeUsage } from '../src/reminders/reminder-wake-usage.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster | null = null;
let connection: HausConnection | null = null;

afterEach(async () => {
    await connection?.close();
    await cluster?.stop();
    connection = null;
    cluster = null;
});

test("links a turn's reported usage to the fire that woke it", async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    const db = connection.db;
    await seedFire(db, 'srv_usage', 'agt_usage', 'rmf_usage');
    await db.insert(agentRunTriggersTable).values({
        agentId: 'agt_usage',
        chatId: 'cht_srv_usage',
        runId: 'run_usage',
        serverId: 'srv_usage',
        source: 'reminder',
        workId: 'rmf_usage',
    });

    await recordReminderWakeUsage(
        db,
        { agentId: 'agt_usage', runId: 'run_usage', serverId: 'srv_usage' },
        {
            cacheReadTokens: 10,
            cacheWriteTokens: 5,
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 165,
        }
    );

    const [fire] = await db
        .select()
        .from(reminderFiresTable)
        .where(eq(reminderFiresTable.id, 'rmf_usage'));
    expect(fire?.wakeTotalTokens).toBe(165);
});

test('does nothing when the runtime reported no usage', async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    const db = connection.db;
    await seedFire(db, 'srv_nousage', 'agt_nousage', 'rmf_nousage');
    await db.insert(agentRunTriggersTable).values({
        agentId: 'agt_nousage',
        chatId: 'cht_srv_nousage',
        runId: 'run_nousage',
        serverId: 'srv_nousage',
        source: 'reminder',
        workId: 'rmf_nousage',
    });

    await recordReminderWakeUsage(
        db,
        { agentId: 'agt_nousage', runId: 'run_nousage', serverId: 'srv_nousage' },
        null
    );

    const [fire] = await db
        .select()
        .from(reminderFiresTable)
        .where(eq(reminderFiresTable.id, 'rmf_nousage'));
    expect(fire?.wakeTotalTokens).toBeNull();
});

test('does nothing when the run was not triggered by a reminder', async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    const db = connection.db;
    await seedFire(db, 'srv_other', 'agt_other', 'rmf_other');
    await db.insert(agentRunTriggersTable).values({
        agentId: 'agt_other',
        chatId: 'cht_srv_other',
        runId: 'run_other',
        serverId: 'srv_other',
        source: 'chat',
        workId: 'msg_unrelated',
    });

    await recordReminderWakeUsage(
        db,
        { agentId: 'agt_other', runId: 'run_other', serverId: 'srv_other' },
        {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
        }
    );

    const [fire] = await db
        .select()
        .from(reminderFiresTable)
        .where(eq(reminderFiresTable.id, 'rmf_other'));
    expect(fire?.wakeTotalTokens).toBeNull();
});

async function seedFire(
    db: HausConnection['db'],
    serverId: string,
    agentId: string,
    fireId: string
) {
    await db.insert(serversTable).values({
        displayName: 'Usage Server',
        id: serverId,
        slug: `usage-server-${serverId.replaceAll('_', '-')}`,
    });
    await db.insert(chatsTable).values({
        id: `cht_${serverId}`,
        isAll: true,
        kind: 'channel',
        lastMessageSequence: 1,
        name: 'all',
        serverId,
    });
    await db.insert(agentsTable).values({
        displayName: 'Cove',
        handle: `usage-cove-${serverId.replaceAll('_', '-')}`,
        homeTimezone: 'America/New_York',
        id: agentId,
        serverId,
    });
    await db.insert(chatMessagesTable).values({
        authorAgentId: agentId,
        chatId: `cht_${serverId}`,
        content: 'Anchor',
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
        id: `msg_${serverId}`,
        nonce: `anchor-${serverId}`,
        sequence: 1,
        serverId,
    });
    await db.insert(remindersTable).values({
        anchorChatId: `cht_${serverId}`,
        anchorMessageId: `msg_${serverId}`,
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
        fireAt: new Date('2099-07-27T13:00:00.000Z'),
        id: `rem_${serverId}`,
        ownerAgentId: agentId,
        script: 'check-disk',
        serverId,
        status: 'scheduled',
        timezone: 'America/New_York',
        title: 'Disk watchdog',
        updatedAt: new Date('2026-07-26T12:00:00.000Z'),
    });
    await db.insert(reminderFiresTable).values({
        firedAt: new Date(),
        hasScript: true,
        id: fireId,
        outcome: 'woke',
        reminderId: `rem_${serverId}`,
        scheduledFor: new Date(),
        serverId,
    });
}
