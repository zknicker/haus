import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { prepareAgentSend } from '../src/agent-api/send-hold.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentDeliveryTable, agentInboxTable } from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';
import { postMessage, readerRunner, seedReader } from './agent-read-fixture.ts';
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

test('a hold serves its shown messages to the active run once and leaves the omitted queued', async () => {
    const seed = await seedReader(connection.db);
    const runner = await activeRun(seed, 'run_hold_served');
    const posted = await postUpdates(seed, 5);

    const held = await send(runner, seed.channelId, 'Status report.');
    expect(shownIds(held)).toEqual(posted.slice(2));

    // The shown three left the queue for this run, so the next drain or pull
    // cannot deliver them again; the omitted two still wait for delivery.
    const queued = await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.state, 'queued')));
    expect(queued.map((row) => row.dedupeKey).sort()).toEqual(posted.slice(0, 2).sort());
    expect(await servedKeys(seed, runner)).toEqual(posted.slice(2).sort());
    expect(await send(runner, seed.channelId, undefined, { sendDraft: true })).toMatchObject({
        kind: 'send',
    });
});

test('a hold serves its shown messages however deep the queued backlog behind them', async () => {
    const seed = await seedReader(connection.db);
    const runner = await activeRun(seed, 'run_hold_backlog');
    // More than a thousand older rows wait in another Chat, ahead of the held ones.
    await connection.db.insert(agentInboxTable).values(
        Array.from({ length: 1001 }, (_, index) => ({
            agentId: seed.agentId,
            chatId: seed.dmChatId,
            content: `Backlog ${index}`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
            dedupeKey: `backlog_${seed.agentId}_${index}`,
            id: createOpaqueId('inb'),
            serverId: seed.serverId,
        }))
    );
    const posted = await postUpdates(seed, 3);

    const held = await send(runner, seed.channelId, 'Status report.');
    expect(shownIds(held)).toEqual(posted);
    expect(await servedKeys(seed, runner)).toEqual([...posted].sort());
});

async function activeRun(seed: Seed, runId: string): Promise<ResolvedRunner> {
    const runner = readerRunner(seed, runId);
    await connection.db.insert(agentDeliveryTable).values({
        acceptedAt: new Date(),
        activeRunComputerId: seed.computerId,
        activeRunId: runner.runId,
        activeRunModelId: 'fake-model',
        activeRunReasoningEffort: 'default',
        activeRunRuntimeId: 'fake',
        agentId: seed.agentId,
        serverId: seed.serverId,
    });
    return runner;
}

async function postUpdates(seed: Seed, count: number): Promise<string[]> {
    const posted: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const message = await postMessage(connection.db, seed, {
            chatId: seed.channelId,
            content: `Update ${index}`,
            recipient: true,
        });
        posted.push(message.id);
    }
    return posted;
}

async function servedKeys(seed: Seed, runner: ResolvedRunner): Promise<string[]> {
    const rows = await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.runId, runner.runId),
                eq(agentInboxTable.state, 'served')
            )
        );
    return rows.map((row) => row.dedupeKey).sort();
}

let nonce = 0;

async function send(
    runner: ResolvedRunner,
    chatId: string,
    content: string | undefined,
    overrides: { sendDraft?: boolean } = {}
) {
    nonce += 1;
    return await prepareAgentSend(connection.db, runner, chatId, {
        attachmentIds: [],
        continueAnyway: false,
        nonce: `send_hold_serving_${nonce}`,
        sendDraft: false,
        ...(content === undefined ? {} : { content }),
        ...overrides,
    });
}

function shownIds(result: Awaited<ReturnType<typeof prepareAgentSend>>) {
    if (result.kind !== 'held') {
        throw new Error('Expected a held send.');
    }
    return result.response.shownMessages.map((message) => message.id);
}
