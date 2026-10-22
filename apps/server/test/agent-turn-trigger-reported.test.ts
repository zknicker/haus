import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { heartbeatReportDedupeKey } from '../src/agent-delivery/heartbeat-keys.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    chatMessagesTable,
    chatsTable,
} from '../src/postgres/schema.ts';
import { resolveAgentTurnTriggers } from '../src/server-agents/agent-turn-trigger-previews.ts';
import { addChannel, seedAgent } from './agent-inbox-harness.ts';
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

const record = (source: string, runId: string) => ({
    chatId: null,
    runId,
    source,
    visible: false,
    workId: `${source}:${runId}`,
});

test('a page of heartbeats learns its reports and yields in one lookup', async () => {
    const seed = await seedAgent(connection.db);
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: null,
        content: 'Q4 budget is stuck on legal.',
        dedupeKey: heartbeatReportDedupeKey('run_reported'),
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    await connection.db.insert(agentHeartbeatChecksTable).values({
        agentId: seed.agentId,
        id: createOpaqueId('hbc'),
        kind: 'daytime',
        localDate: '2026-10-21',
        outcome: 'yielded',
        runId: 'run_yielded',
        serverId: seed.serverId,
        slot: '10:00',
    });
    expect(
        await resolveAgentTurnTriggers(
            connection.db,
            { serverId: seed.serverId, userId: seed.userId },
            [
                record('heartbeat', 'run_reported'),
                record('heartbeat', 'run_quiet'),
                record('heartbeat', 'run_yielded'),
                null,
            ]
        )
    ).toEqual([
        {
            kind: 'heartbeat',
            report: { posted: false, postedChatId: null, text: 'Q4 budget is stuck on legal.' },
            yielded: false,
        },
        { kind: 'heartbeat', report: null, yielded: false },
        { kind: 'heartbeat', report: null, yielded: true },
        null,
    ]);
});

test('a report posted where the viewer cannot see still reads as posted', async () => {
    const seed = await seedAgent(connection.db);
    const hiddenChatId = await addChannel(connection.db, seed, 'gone');
    await connection.db
        .update(chatsTable)
        .set({ deletedAt: new Date(), deletedByUserId: seed.userId })
        .where(eq(chatsTable.id, hiddenChatId));
    await connection.db.insert(chatMessagesTable).values({
        authorAgentId: seed.agentId,
        chatId: hiddenChatId,
        content: 'Posted the finding.',
        id: createOpaqueId('msg'),
        nonce: createOpaqueId('nonce'),
        runId: 'run_main_report',
        sequence: 1,
        serverId: seed.serverId,
    });
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: null,
        content: 'Shipping is late.',
        dedupeKey: heartbeatReportDedupeKey('run_posted'),
        id: createOpaqueId('inb'),
        runId: 'run_main_report',
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    expect(
        await resolveAgentTurnTriggers(
            connection.db,
            { serverId: seed.serverId, userId: seed.userId },
            [record('heartbeat', 'run_posted')]
        )
    ).toEqual([
        {
            kind: 'heartbeat',
            report: { posted: true, postedChatId: null, text: 'Shipping is late.' },
            yielded: false,
        },
    ]);
});

test('a dream carries its first learned line and the memory lines it changed', async () => {
    const seed = await seedAgent(connection.db);
    const dreamValues = {
        agentId: seed.agentId,
        serverId: seed.serverId,
    };
    await connection.db.insert(agentDreamSummariesTable).values({
        ...dreamValues,
        runId: 'run_learned',
        summary: '\n- Prefers terse replies.\n- Posts go in #all.',
    });
    await connection.db.insert(agentDreamsTable).values({
        ...dreamValues,
        files: [{ added: 3, change: 'modified', path: 'MEMORY.md', removed: 1 }],
        finishedAt: new Date(),
        patch: '',
        runId: 'run_learned',
        startedAt: new Date(),
    });
    expect(
        await resolveAgentTurnTriggers(
            connection.db,
            { serverId: seed.serverId, userId: seed.userId },
            [record('dream', 'run_learned'), record('dream', 'run_empty')]
        )
    ).toEqual([
        { added: 3, kind: 'dream', learned: 'Prefers terse replies.', removed: 1 },
        { added: 0, kind: 'dream', learned: null, removed: 0 },
    ]);
});
