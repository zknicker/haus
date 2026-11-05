import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentCommand } from '@haus/api';
import { eq } from 'drizzle-orm';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentInboxTable,
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
    remindersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Run accounting and the wake decision play out through the real settlement path,
// `AgentDelivery.onReminderScriptResult`; `reminder-wake-decision.test.ts` covers the
// decision function itself in isolation.

const serverId = 'srv_wakerules';
const chatId = 'cht_wakerules';
const agentId = 'agt_wakerules';
const anchorMessageId = 'msg_wakerules_anchor';
const reminderId = 'rem_wakerules';
const computerId = 'cmp_wwwwwwwwwwwwwwww';

class RecordingTransport implements DeliveryTransport {
    readonly frames: AgentCommand[] = [];

    isOnline(): boolean {
        return true;
    }

    send(_computerId: string, frame: AgentCommand): boolean {
        this.frames.push(frame);
        return true;
    }
}

let cluster: PostgresCluster | null = null;
let connection: HausConnection | null = null;

afterEach(async () => {
    await connection?.close();
    await cluster?.stop();
    connection = null;
    cluster = null;
});

describe('reminder wake rules settlement', () => {
    test('accounts for a failure streak, a failed-threshold wake, recovery, and wake-on-change', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedWakeRuleReminder(connection, { failAfter: 2, wakeOnChange: true });

        const delivery = new AgentDelivery(connection.db, new RecordingTransport());

        // Run 1: a failure below the threshold stays quiet.
        await settle(connection, delivery, 'rmf_1', {
            exitCode: 1,
            output: 'disk check failed',
            timedOut: false,
        });
        await expectFire(connection, 'rmf_1', { outcome: 'failed' });
        await expectReminderState(connection, { consecutiveFailures: 1 });
        expect(await countInbox(connection)).toBe(0);

        // Run 2: the Nth (2nd) consecutive failure wakes once, with the excerpt.
        await settle(connection, delivery, 'rmf_2', {
            exitCode: 1,
            output: 'disk check failed',
            timedOut: false,
        });
        await expectFire(connection, 'rmf_2', { outcome: 'woke' });
        await expectReminderState(connection, { consecutiveFailures: 2 });
        expect(await countInbox(connection)).toBe(1);
        expect(await latestInboxContent(connection)).toContain('🔔 Reminder script exited 1.');

        // Run 3: the first success after a streak that woke sends one short
        // "recovered" notice, even though its own output is empty.
        await settle(connection, delivery, 'rmf_3', { exitCode: 0, output: '', timedOut: false });
        await expectFire(connection, 'rmf_3', { outcome: 'recovered' });
        await expectReminderState(connection, { consecutiveFailures: 0 });
        expect(await countInbox(connection)).toBe(2);
        expect(await latestInboxContent(connection)).toContain(
            '🔔 Reminder script recovered, after 2 failed runs.'
        );

        // Run 4: a success with new output wakes and remembers its hash.
        await settle(connection, delivery, 'rmf_4', {
            exitCode: 0,
            output: 'disk ok',
            timedOut: false,
        });
        await expectFire(connection, 'rmf_4', { outcome: 'woke' });
        expect(await countInbox(connection)).toBe(3);
        expect(await latestInboxContent(connection)).toContain('disk ok');

        // Run 5: the identical output is a quiet "unchanged" run, not a wake.
        await settle(connection, delivery, 'rmf_5', {
            exitCode: 0,
            output: 'disk ok',
            timedOut: false,
        });
        await expectFire(connection, 'rmf_5', { outcome: 'unchanged' });
        expect(await countInbox(connection)).toBe(3);

        // Run 6: trailing whitespace alone does not count as a change.
        await settle(connection, delivery, 'rmf_6', {
            exitCode: 0,
            output: 'disk ok   \n',
            timedOut: false,
        });
        await expectFire(connection, 'rmf_6', { outcome: 'unchanged' });
        expect(await countInbox(connection)).toBe(3);
    });

    test('a duration the Computer reports settles onto the fire row', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedWakeRuleReminder(connection, { failAfter: null, wakeOnChange: false });
        const delivery = new AgentDelivery(connection.db, new RecordingTransport());

        await settle(
            connection,
            delivery,
            'rmf_duration',
            { exitCode: 0, output: 'done', timedOut: false },
            { durationMs: 842 }
        );
        const [fire] = await connection.db
            .select()
            .from(reminderFiresTable)
            .where(eq(reminderFiresTable.id, 'rmf_duration'));
        expect(fire).toMatchObject({ durationMs: 842, outcome: 'woke' });
    });

    test("without --fail-after, every failure keeps waking (today's behavior)", async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedWakeRuleReminder(connection, { failAfter: null, wakeOnChange: false });
        const delivery = new AgentDelivery(connection.db, new RecordingTransport());

        await settle(connection, delivery, 'rmf_a', { exitCode: 1, output: '', timedOut: false });
        await settle(connection, delivery, 'rmf_b', { exitCode: 1, output: '', timedOut: false });

        await expectFire(connection, 'rmf_a', { outcome: 'woke' });
        await expectFire(connection, 'rmf_b', { outcome: 'woke' });
        expect(await countInbox(connection)).toBe(2);
    });
});

async function settle(
    haus: HausConnection,
    delivery: AgentDelivery,
    fireId: string,
    script: { exitCode: number; output: string; timedOut: boolean },
    extra: { durationMs?: number } = {}
) {
    const attentionId = `rma_${fireId}`;
    await haus.db.insert(reminderFiresTable).values({
        firedAt: new Date(),
        hasScript: true,
        id: fireId,
        reminderId,
        scheduledFor: new Date(),
        serverId,
    });
    await haus.db.insert(reminderAgentAttentionTable).values({
        agentId,
        anchorChatId: chatId,
        fireId,
        id: attentionId,
        kind: 'reminder_script',
        queuedAt: new Date(),
        reminderId,
        script: 'check-disk',
        serverId,
    });
    await delivery.onReminderScriptResult(computerId, {
        agentId,
        attentionId,
        fireId,
        type: 'reminder-script-result',
        ...script,
        ...extra,
    });
}

async function expectFire(
    haus: HausConnection,
    fireId: string,
    expected: Partial<typeof reminderFiresTable.$inferSelect>
) {
    const [fire] = await haus.db
        .select()
        .from(reminderFiresTable)
        .where(eq(reminderFiresTable.id, fireId));
    expect(fire).toMatchObject(expected);
}

async function expectReminderState(
    haus: HausConnection,
    expected: { consecutiveFailures: number }
) {
    const [reminder] = await haus.db
        .select()
        .from(remindersTable)
        .where(eq(remindersTable.id, reminderId));
    expect(reminder).toMatchObject(expected);
}

async function countInbox(haus: HausConnection) {
    return (await haus.db.select().from(agentInboxTable)).length;
}

async function latestInboxContent(haus: HausConnection) {
    const rows = await haus.db.select().from(agentInboxTable);
    return rows.at(-1)?.content ?? '';
}

async function seedWakeRuleReminder(
    haus: HausConnection,
    rules: { failAfter: number | null; wakeOnChange: boolean }
) {
    await haus.db.insert(usersTable).values({ authSubject: 'cf_wakerules', id: 'usr_wakerules' });
    await haus.db.insert(serversTable).values({
        displayName: 'Wake Rules Server',
        id: serverId,
        slug: 'wake-rules-server',
    });
    await haus.db.insert(serverMembershipsTable).values({
        id: 'mem_wakerules',
        role: 'owner',
        serverId,
        userId: 'usr_wakerules',
    });
    await haus.db.insert(chatsTable).values({
        id: chatId,
        isAll: true,
        kind: 'channel',
        lastMessageSequence: 1,
        name: 'all',
        serverId,
    });
    await haus.db.insert(computersTable).values({
        attachedByUserId: 'usr_wakerules',
        credentialHash: 'b'.repeat(64),
        id: computerId,
        serverId,
    });
    await haus.db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Cove',
        handle: 'wakerules-cove',
        homeTimezone: 'America/New_York',
        id: agentId,
        serverId,
    });
    await haus.db.insert(chatMessagesTable).values({
        authorAgentId: agentId,
        chatId,
        content: 'Anchor',
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
        id: anchorMessageId,
        nonce: 'anchor',
        sequence: 1,
        serverId,
    });
    await haus.db.insert(channelAgentParticipantsTable).values({ agentId, chatId, serverId });
    await haus.db.insert(remindersTable).values({
        anchorChatId: chatId,
        anchorMessageId,
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
        failAfter: rules.failAfter,
        fireAt: new Date('2099-07-27T13:00:00.000Z'),
        id: reminderId,
        ownerAgentId: agentId,
        repeat: 'every:1h',
        script: 'check-disk',
        serverId,
        status: 'scheduled',
        timezone: 'America/New_York',
        title: 'Disk watchdog',
        updatedAt: new Date('2026-07-26T12:00:00.000Z'),
        wakeOnChange: rules.wakeOnChange,
    });
}
