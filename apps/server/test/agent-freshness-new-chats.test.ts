import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { createAgentChannel } from '../src/agent-api/channel-create.ts';
import { assertFreshAgentView } from '../src/agent-api/chat-freshness.ts';
import { prepareAgentSend } from '../src/agent-api/send-hold.ts';
import { enqueueAgentGreeting, greetingDedupeKey } from '../src/agent-delivery/greeting.ts';
import { joinChannelAgents } from '../src/chats/channel-agent-membership.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, chatsTable } from '../src/postgres/schema.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import { postMessage, readerRunner } from './agent-read-fixture.ts';
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

test('a queued greeting is not a message: it never holds or stales the greeting post', async () => {
    const db = connection.db;
    const seed = await seedAgent(db);
    for (let index = 0; index < 5; index += 1) {
        await postMessage(db, seed, { chatId: seed.channelId, content: `Before ${index}` });
    }
    await joinChannelAgents(db, {
        agentIds: [seed.agentId],
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

test('the first send into a channel the Agent just created is not held', async () => {
    const db = connection.db;
    const seed = await seedAgent(db);
    const runner = readerRunner(seed, 'run_channel_create');
    const { receipt } = await createAgentChannel(db, runner, {
        humans: [`@${seed.humanHandle}`],
        name: 'launch-plan',
    });
    expect(receipt.target).toBe('#launch-plan');
    const [channel] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, seed.serverId), eq(chatsTable.name, 'launch-plan')));
    if (!channel) {
        throw new Error('The created channel is missing.');
    }

    await expect(assertFreshAgentView(db, runner, channel.id)).resolves.toBeUndefined();
    expect(await send(runner, channel.id, 'Kicking off the launch plan here.')).toMatchObject({
        kind: 'send',
    });
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
