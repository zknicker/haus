import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../src/agent-api/chat-freshness.ts';
import { prepareAgentSend } from '../src/agent-api/send-hold.ts';
import { enqueueAgentGreeting, greetingDedupeKey } from '../src/agent-delivery/greeting.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import { postMessage, readerRunner, homeAgentIn } from './agent-read-fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('a queued greeting is not a message: it never holds or stales the greeting post', async () => {
    const db = connection.db;
    const seed = await seedAgent(db);
    for (let index = 0; index < 5; index += 1) {
        await postMessage(db, seed, { chatId: seed.channelId, content: `Before ${index}` });
    }
    await homeAgentIn(db, {
        agentId: seed.agentId,
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    await enqueueAgentGreeting(db, {
        agentId: seed.agentId,
        allChannelId: seed.channelId,
        serverId: seed.serverId,
    });
    const runner = readerRunner(seed, 'run_greeting');

    await expect(assertFreshAgentView(db, runner, seed.channelId)).resolves.toBeUndefined();
    expect(await send(runner, seed.channelId, 'Hi all, I just joined.')).toMatchObject({
        kind: 'send',
    });
    // The freshness check's seen advance retires message rows only; the
    // greeting stays queued for the run that carries it.
    const [greeting] = await db
        .select({ state: agentInboxTable.state })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, seed.agentId),
                eq(agentInboxTable.dedupeKey, greetingDedupeKey(seed.agentId))
            )
        );
    expect(greeting).toEqual({ state: 'queued' });
});

let nonce = 0;

async function send(runner: ResolvedRunner, chatId: string, content: string) {
    nonce += 1;
    return await prepareAgentSend(connection.db, runner, chatId, {
        attachmentIds: [],
        content,
        continueAnyway: false,
        nonce: `fresh_new_${nonce}`,
        sendDraft: false,
    });
}
