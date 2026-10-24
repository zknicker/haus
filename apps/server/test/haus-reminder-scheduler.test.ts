import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentCommand } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { eq, sql } from 'drizzle-orm';
import { pullAgentEvents } from '../src/agent-api/inbox.ts';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { createHausServerApplication } from '../src/haus-server-application.ts';
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
import { createReminderScheduler } from '../src/reminders/reminder-scheduler.ts';
import { tickReminders } from '../src/reminders/scheduler.ts';
import { type ClerkTestIssuer, startClerkTestIssuer } from './clerk-test-issuer.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const appOrigin = 'https://app.haus.test';
const dueAt = new Date('2026-07-26T13:00:00.000Z');
const now = new Date('2026-07-26T14:00:00.000Z');
let clerk: ClerkTestIssuer | null = null;
let cluster: PostgresCluster | null = null;
let connection: HausConnection | null = null;
let attachmentRoot: string | null = null;

afterEach(async () => {
    await connection?.close();
    await clerk?.close();
    await cluster?.stop();
    if (attachmentRoot) {
        await rm(attachmentRoot, { force: true, recursive: true });
    }
    connection = null;
    clerk = null;
    cluster = null;
    attachmentRoot = null;
});
describe('reminder scheduler lifecycle', () => {
    test('fresh schema indexes the global scheduled-due scan', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);

        const result = await connection.db.execute(sql`
            select indexdef
            from pg_indexes
            where schemaname = 'public'
              and tablename = 'reminders'
              and indexname = 'reminders_due_idx'
        `);

        expect(result).toHaveLength(1);
        expect(result[0]?.indexdef).toContain('(fire_at, id)');
        expect(result[0]?.indexdef).toContain("WHERE (status = 'scheduled'::text)");
    });

    test('recovers one overdue fire on startup and does not burst after restart', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        clerk = await startClerkTestIssuer(appOrigin);
        connection = await connectHausDatabase(cluster.databaseUrl);
        attachmentRoot = await mkdtemp(join(tmpdir(), 'haus-reminder-attachments-'));
        await seedOverdueReminder(connection);
        await connection.close();
        connection = null;

        const first = await createHausServerApplication({
            appOrigin,
            attachmentRoot,
            clerkIssuerUrl: clerk.url,
            databaseUrl: cluster.databaseUrl,
            reminderClock: { now: () => now },
        });
        const firstHealth = await first.app.inject({ method: 'GET', url: '/healthz' });
        await first.close();

        const restarted = await createHausServerApplication({
            appOrigin,
            attachmentRoot,
            clerkIssuerUrl: clerk.url,
            databaseUrl: cluster.databaseUrl,
            reminderClock: { now: () => now },
        });
        const restartHealth = await restarted.app.inject({ method: 'GET', url: '/healthz' });
        await restarted.close();

        connection = await connectHausDatabase(cluster.databaseUrl);
        const fires = await connection.db.select().from(reminderFiresTable);
        expect(fires).toHaveLength(1);
        expect(fires[0]).toMatchObject({
            firedAt: now,
            scheduledFor: dueAt,
        });
        expect(firstHealth.json()).toEqual({
            reminders: {
                consecutiveFailures: 0,
                lastSuccessfulTickAt: now.toISOString(),
                status: 'healthy',
            },
            status: 'ok',
        });
        expect(restartHealth.json()).toEqual(firstHealth.json());
    });

    test('waits for an in-flight tick during graceful shutdown', async () => {
        const runtime = makeTestRuntime();
        const tickStarted = Promise.withResolvers<void>();
        const releaseTick = Promise.withResolvers<void>();
        const scheduler = await createReminderScheduler({
            clock: { now: () => now },
            runtime,
            tick: async () => {
                tickStarted.resolve();
                await releaseTick.promise;
            },
        });
        const starting = scheduler.start();
        await tickStarted.promise;

        let closed = false;
        const closing = scheduler.close().then(() => {
            closed = true;
        });
        await Promise.resolve();
        expect(closed).toBe(false);

        releaseTick.resolve();
        await Promise.all([starting, closing]);
        expect(closed).toBe(true);
        await runtime.dispose();
    });

    test('reports failures without exposing their details and recovers on success', async () => {
        const runtime = makeTestRuntime();
        let shouldFail = true;
        const scheduler = await createReminderScheduler({
            clock: { now: () => now },
            runtime,
            tick: async () => {
                if (shouldFail) {
                    throw new Error('database host and secret details');
                }
            },
        });

        await scheduler.start();
        expect(scheduler.health()).toEqual({
            consecutiveFailures: 1,
            lastSuccessfulTickAt: null,
            status: 'degraded',
        });
        expect(JSON.stringify(scheduler.health())).not.toContain('secret');

        shouldFail = false;
        await scheduler.wake();
        expect(scheduler.health()).toEqual({
            consecutiveFailures: 0,
            lastSuccessfulTickAt: now.toISOString(),
            status: 'healthy',
        });
        await scheduler.close();
        expect(scheduler.health()).toEqual({
            consecutiveFailures: 0,
            lastSuccessfulTickAt: now.toISOString(),
            status: 'stopped',
        });
        await runtime.dispose();
    });

    test('continues past one poisoned reminder and reports the degraded tick', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedOverdueReminder(connection);
        await connection.db
            .update(remindersTable)
            .set({ repeat: 'daily@09:00', timezone: 'Not/A_Timezone' })
            .where(eq(remindersTable.id, 'rem_scheduler'));
        await connection.db.insert(remindersTable).values({
            anchorChatId: 'cht_scheduler',
            anchorMessageId: 'msg_scheduler_anchor',
            createdAt: new Date('2026-07-26T12:00:00.000Z'),
            fireAt: new Date('2026-07-26T13:01:00.000Z'),
            id: 'rem_scheduler_healthy',
            ownerAgentId: 'agt_scheduler',
            serverId: 'srv_scheduler',
            status: 'scheduled',
            timezone: 'America/New_York',
            title: 'Still fires',
            updatedAt: new Date('2026-07-26T12:00:00.000Z'),
        });

        await expect(tickReminders(connection.db, { now: () => now })).rejects.toThrow(
            'could not fire'
        );

        const fires = await connection.db.select().from(reminderFiresTable);
        expect(fires).toHaveLength(1);
        expect(fires[0]?.reminderId).toBe('rem_scheduler_healthy');
    });

    test('dispatches script fires to Computer and wakes the Agent only for output', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedOverdueReminder(connection);
        await configureComputer(connection);
        await connection.db
            .update(remindersTable)
            .set({ repeat: null, script: 'printf changed' })
            .where(eq(remindersTable.id, 'rem_scheduler'));

        const transport = new RecordingTransport();
        const delivery = new AgentDelivery(connection.db, transport);
        await tickReminders(connection.db, { now: () => now }, delivery);

        const command = transport.frames.find((frame) => frame.type === 'reminder-script');
        expect(command).toMatchObject({
            agentId: 'agt_scheduler',
            script: 'printf changed',
            type: 'reminder-script',
        });
        if (!command || command.type !== 'reminder-script') {
            throw new Error('Reminder script did not dispatch.');
        }
        expect(transport.frames.some((frame) => frame.type === 'start')).toBe(false);

        await delivery.onReminderScriptResult('cmp_ssssssssssssssss', {
            agentId: command.agentId,
            attentionId: command.attentionId,
            exitCode: 0,
            fireId: command.fireId,
            output: 'changed',
            timedOut: false,
            type: 'reminder-script-result',
        });
        expect(transport.frames.some((frame) => frame.type === 'start')).toBe(true);
        expect(await connection.db.select().from(reminderAgentAttentionTable)).toHaveLength(0);
        const [fire] = await connection.db.select().from(reminderFiresTable);
        expect(fire).toMatchObject({
            scriptExitCode: 0,
            scriptOutput: 'changed',
            scriptTimedOut: false,
        });
        // Script output rides the wake envelope; it is never a Chat message.
        expect(
            (await connection.db.select().from(chatMessagesTable)).map((message) => message.id)
        ).toEqual(['msg_scheduler_anchor']);
        const [queued] = await connection.db.select().from(agentInboxTable);
        expect(queued).toMatchObject({ dedupeKey: fire?.id, source: 'reminder' });
        expect(queued?.content).toBe(
            [
                '🔔 Reminder: Recover me',
                `fire=${fire?.id}`,
                '🔔 Reminder script output:',
                '  changed',
                `reply with: --cause ${fire?.id} on the command that posts (haus message send or haus cloud-agent start)`,
            ].join('\n')
        );
    });

    test('replays one offline script fire on reconnect and settles it exactly once', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedOverdueReminder(connection);
        await configureComputer(connection);
        await connection.db
            .update(remindersTable)
            .set({ repeat: 'daily@09:00', script: 'printf changed' })
            .where(eq(remindersTable.id, 'rem_scheduler'));

        const transport = new RecordingTransport();
        transport.online = false;
        const delivery = new AgentDelivery(connection.db, transport);
        await tickReminders(connection.db, { now: () => now }, delivery);

        expect(transport.frames).toHaveLength(0);
        expect(await connection.db.select().from(reminderAgentAttentionTable)).toHaveLength(1);

        transport.online = true;
        await delivery.onComputerReconnect('cmp_ssssssssssssssss');
        const command = transport.frames.find((frame) => frame.type === 'reminder-script');
        expect(command).toMatchObject({
            agentId: 'agt_scheduler',
            script: 'printf changed',
            type: 'reminder-script',
        });
        if (!command || command.type !== 'reminder-script') {
            throw new Error('Reminder script did not replay on reconnect.');
        }

        const result = {
            agentId: command.agentId,
            attentionId: command.attentionId,
            exitCode: 0,
            fireId: command.fireId,
            output: 'changed',
            timedOut: false,
            type: 'reminder-script-result' as const,
        };
        await delivery.onReminderScriptResult('cmp_ssssssssssssssss', result);
        await delivery.onReminderScriptResult('cmp_ssssssssssssssss', result);
        await delivery.onComputerReconnect('cmp_ssssssssssssssss');

        expect(transport.frames.filter((frame) => frame.type === 'reminder-script')).toHaveLength(
            1
        );
        const starts = transport.frames.filter((frame) => frame.type === 'start');
        expect(starts.length).toBeGreaterThanOrEqual(1);
        expect(new Set(starts.map((frame) => frame.runId))).toHaveLength(1);
        expect(await connection.db.select().from(reminderAgentAttentionTable)).toHaveLength(0);
        const [fire] = await connection.db.select().from(reminderFiresTable);
        expect(fire).toMatchObject({
            scriptExitCode: 0,
            scriptOutput: 'changed',
            scriptTimedOut: false,
        });
    });

    test('delivers one ordinary overdue reminder after reconnect and clears attention on completion', async () => {
        cluster = await startPostgresCluster();
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        await seedOverdueReminder(connection);
        await configureComputer(connection);
        await connection.db
            .update(remindersTable)
            .set({ repeat: null })
            .where(eq(remindersTable.id, 'rem_scheduler'));

        const transport = new RecordingTransport();
        transport.online = false;
        const delivery = new AgentDelivery(connection.db, transport);
        await tickReminders(connection.db, { now: () => now }, delivery);

        expect(transport.frames).toHaveLength(0);
        expect(await connection.db.select().from(reminderAgentAttentionTable)).toHaveLength(1);

        transport.online = true;
        await delivery.onComputerReconnect('cmp_ssssssssssssssss');
        const starts = transport.frames.filter((frame) => frame.type === 'start');
        expect(starts).toHaveLength(1);
        const start = starts[0];
        if (!start || start.type !== 'start') {
            throw new Error('Ordinary reminder did not start the Agent.');
        }
        // The fire rides the concrete lane, so its envelope is the prompt the
        // Agent wakes with rather than a notice it has to pull.
        expect(start.inboxDelivery).toBe('concrete');
        const [item] = start.inbox ?? [];
        const fireId = item?.id ?? '';
        const envelope = item?.content ?? '';
        expect(fireId).toMatch(/^rmf_/u);
        expect(item).toMatchObject({
            senderHandle: 'reminder',
            senderType: 'system',
            target: '#all',
        });
        expect(envelope).toBe(
            [
                '🔔 Reminder: Recover me',
                `fire=${fireId}`,
                `reply with: --cause ${fireId} on the command that posts (haus message send or haus cloud-agent start)`,
            ].join('\n')
        );

        await delivery.onAck({ agentId: start.agentId, runId: start.runId });
        // Acceptance is the serve: the run already carries the envelope, so a
        // pull has nothing left to hand over.
        const pulled = await pullAgentEvents(connection.db, {
            agentId: start.agentId,
            capabilities: [],
            chatId: 'cht_scheduler',
            computerId: 'cmp_ssssssssssssssss',
            runId: start.runId,
            runnerId: 'arc_scheduler',
            serverId: 'srv_scheduler',
        });
        expect(pulled.messages).toEqual([]);
        expect(pulled.automations).toEqual([]);
        await delivery.onTurnSettled('cmp_ssssssssssssssss', {
            agentId: start.agentId,
            endedAt: '2026-07-26T14:00:02.000Z',
            messageCount: 1,
            modelId: 'gpt-test',
            outputProduced: true,
            runId: start.runId,
            runtimeId: 'codex',
            startedAt: '2026-07-26T14:00:01.000Z',
            status: 'completed',
            summary: 'followed up',
            tokenUsage: null,
            activity: { operations: [] },
            type: 'turn',
        });

        expect(await connection.db.select().from(reminderAgentAttentionTable)).toHaveLength(0);
        await delivery.onComputerReconnect('cmp_ssssssssssssssss');
        expect(transport.frames.filter((frame) => frame.type === 'start')).toHaveLength(1);
    });
});

class RecordingTransport implements DeliveryTransport {
    readonly frames: AgentCommand[] = [];
    online = true;

    isOnline(computerId: string): boolean {
        return this.online && computerId === 'cmp_ssssssssssssssss';
    }

    send(computerId: string, frame: AgentCommand): boolean {
        if (!this.isOnline(computerId)) {
            return false;
        }
        this.frames.push(frame);
        return true;
    }
}

async function seedOverdueReminder(haus: HausConnection) {
    const serverId = 'srv_scheduler';
    const chatId = 'cht_scheduler';
    const agentId = 'agt_scheduler';
    const anchorMessageId = 'msg_scheduler_anchor';
    await haus.db.insert(serversTable).values({
        displayName: 'Scheduler Server',
        id: serverId,
        slug: 'scheduler-server',
    });
    await haus.db.insert(chatsTable).values({
        id: chatId,
        isAll: true,
        kind: 'channel',
        lastMessageSequence: 1,
        name: 'all',
        serverId,
    });
    await haus.db.insert(agentsTable).values({
        displayName: 'Cove',
        handle: 'scheduler-cove',
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
    await haus.db.insert(channelAgentParticipantsTable).values({
        agentId,
        chatId,
        serverId,
    });
    await haus.db.insert(remindersTable).values({
        anchorChatId: chatId,
        anchorMessageId,
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
        fireAt: dueAt,
        id: 'rem_scheduler',
        ownerAgentId: agentId,
        repeat: 'every:1h',
        serverId,
        status: 'scheduled',
        timezone: 'America/New_York',
        title: 'Recover me',
        updatedAt: new Date('2026-07-26T12:00:00.000Z'),
    });
}

async function configureComputer(haus: HausConnection) {
    await haus.db
        .insert(usersTable)
        .values({ clerkUserId: 'clerk_scheduler', id: 'usr_scheduler' });
    await haus.db.insert(serverMembershipsTable).values({
        id: 'mem_scheduler',
        role: 'owner',
        serverId: 'srv_scheduler',
        userId: 'usr_scheduler',
    });
    await haus.db.insert(computersTable).values({
        attachedByUserId: 'usr_scheduler',
        credentialHash: 'a'.repeat(64),
        id: 'cmp_ssssssssssssssss',
        serverId: 'srv_scheduler',
    });
    await haus.db
        .update(agentsTable)
        .set({
            computerId: 'cmp_ssssssssssssssss',
            desiredModelId: 'fake-model',
            desiredRuntimeId: 'fake',
        })
        .where(eq(agentsTable.id, 'agt_scheduler'));
}
