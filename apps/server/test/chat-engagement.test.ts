import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ChatEngagementEvent } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { attestAgentEvents, pullAgentEvents } from '../src/agent-api/inbox.ts';
import { readChatEngagements } from '../src/agent-delivery/chat-engagement.ts';
import {
    announceRunEngagements,
    installChatEngagementProjector,
    subscribeToChatEngagements,
} from '../src/agent-delivery/chat-engagement-events.ts';
import { publishAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable, agentsTable } from '../src/postgres/schema.ts';
import { agentPost, post, settledSummary, wakeOn } from './chat-engagement-harness.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;
let uninstall: () => void;
const settleWork: Promise<unknown>[] = [];
const events: ChatEngagementEvent[] = [];
const feed = new AbortController();

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    uninstall = installChatEngagementProjector(connection.db, {
        run: (_operation, work) => {
            const task = work().then(() => undefined);
            settleWork.push(task);
            return task;
        },
    });
    void (async () => {
        for await (const event of subscribeToChatEngagements(feed.signal)) {
            events.push(event);
        }
    })().catch(() => undefined);
});

afterAll(async () => {
    feed.abort();
    uninstall?.();
    await connection?.close();
    await cluster?.stop();
});

/** Lets the in-process feed deliver what was just published. */
async function drained() {
    await Promise.all(settleWork);
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventsFor(runId: string) {
    return events
        .filter((event) => event.runId === runId)
        .map((event) =>
            event.type === 'chat.engagement.ended'
                ? { chatId: event.chatId, reason: event.reason, type: 'ended' }
                : { chatId: event.chatId, type: 'started' }
        );
}

async function compose(
    runner: { agentId: string; runId: string; serverId: string },
    messages: Array<{ chatId: string; id: string; sequence: number }>
) {
    await attestAgentEvents(connection.db, runner as never, messages, { composed: true });
    await announceRunEngagements(connection.db, runner);
    await drained();
}

test('a composed receipt starts engagement, and a resend reproduces it without a second start', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);

    await compose(runner, [wakeMessage]);
    expect(eventsFor(runner.runId)).toEqual([{ chatId: seed.channelId, type: 'started' }]);
    const first = await readChatEngagements(connection.db, {
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    expect(first).toMatchObject([{ agentId: seed.agentId, runId: runner.runId }]);

    // The Computer resends the start frame and re-posts the same receipt.
    await compose(runner, [wakeMessage]);
    expect(eventsFor(runner.runId)).toHaveLength(1);
    expect(
        await readChatEngagements(connection.db, {
            chatId: seed.channelId,
            serverId: seed.serverId,
        })
    ).toEqual(first);
});

test('a sole-addressed cold wake drains its message and engages at turn start', async () => {
    const { runner, seed, start, wakeMessage } = await wakeOn(
        connection.db,
        'Can you check the deploy?',
        'sole'
    );
    // Drainable on any start, so a cold session composes it and posts the receipt.
    expect(start?.drainItemIds).toEqual([wakeMessage.id]);

    await compose(runner, [wakeMessage]);
    expect(eventsFor(runner.runId)).toEqual([{ chatId: seed.channelId, type: 'started' }]);
});

test('a mid-turn pull starts engagement in the Chat it read', async () => {
    const { delivery, runner, seed, wakeMessage } = await wakeOn(connection.db);
    await compose(runner, [wakeMessage]);
    const news = await post(
        connection.db,
        seed,
        delivery,
        seed.dmChatId,
        'Quick question for you.'
    );

    const pulled = await pullAgentEvents(connection.db, runner as never);
    expect(pulled.messages.map((row) => row.message.id)).toContain(news.id);
    await announceRunEngagements(connection.db, runner);
    await drained();

    expect(eventsFor(runner.runId)).toEqual([
        { chatId: seed.channelId, type: 'started' },
        { chatId: seed.dmChatId, type: 'started' },
    ]);
});

test('a send ends engagement in that Chat at once and a later read restarts it', async () => {
    const { delivery, runner, seed, wakeMessage } = await wakeOn(connection.db);
    await compose(runner, [wakeMessage]);

    await agentPost(connection.db, seed, seed.channelId);
    publishAgentLifecycle({
        agentId: seed.agentId,
        chatId: seed.channelId,
        compositionId: runner.runId,
        phase: 'sending',
        runId: runner.runId,
        serverId: seed.serverId,
        text: 'On it.',
    });
    await drained();
    expect(eventsFor(runner.runId)).toEqual([
        { chatId: seed.channelId, type: 'started' },
        { chatId: seed.channelId, reason: 'sent', type: 'ended' },
    ]);
    expect(
        await readChatEngagements(connection.db, {
            chatId: seed.channelId,
            serverId: seed.serverId,
        })
    ).toEqual([]);

    const followUp = await post(
        connection.db,
        seed,
        delivery,
        seed.channelId,
        'Also the staging one?'
    );
    await compose(runner, [followUp]);
    expect(eventsFor(runner.runId).at(-1)).toEqual({ chatId: seed.channelId, type: 'started' });
});

test('settlement ends every engaged Chat, as settled or interrupted', async () => {
    const completed = await wakeOn(connection.db);
    await compose(completed.runner, [completed.wakeMessage]);
    await completed.delivery.onTurnSettled(
        completed.seed.computerId,
        settledSummary(completed.seed.agentId, completed.runner.runId)
    );
    await drained();
    expect(eventsFor(completed.runner.runId).at(-1)).toEqual({
        chatId: completed.seed.channelId,
        reason: 'settled',
        type: 'ended',
    });
    expect(
        await readChatEngagements(connection.db, {
            chatId: completed.seed.channelId,
            serverId: completed.seed.serverId,
        })
    ).toEqual([]);

    const stopped = await wakeOn(connection.db);
    await compose(stopped.runner, [stopped.wakeMessage]);
    await stopped.delivery.stop({ agentId: stopped.seed.agentId, serverId: stopped.seed.serverId });
    await drained();
    expect(eventsFor(stopped.runner.runId).at(-1)).toEqual({
        chatId: stopped.seed.channelId,
        reason: 'interrupted',
        type: 'ended',
    });
    // A late start for a settled run is dropped.
    await announceRunEngagements(connection.db, stopped.runner);
    await drained();
    expect(eventsFor(stopped.runner.runId).at(-1)?.type).toBe('ended');
});

test('a confident no-reply judgment suppresses engagement; an uncertain one does not', async () => {
    const quiet = await wakeOn(connection.db, 'FYI, no reply needed: the deploy finished.');
    await connection.db
        .update(agentInboxTable)
        .set({ expectsReply: 0.2 })
        .where(
            and(
                eq(agentInboxTable.agentId, quiet.seed.agentId),
                eq(agentInboxTable.dedupeKey, quiet.wakeMessage.id)
            )
        );
    await compose(quiet.runner, [quiet.wakeMessage]);
    expect(eventsFor(quiet.runner.runId)).toEqual([]);

    const unsure = await wakeOn(connection.db, 'The deploy finished, thoughts?');
    await connection.db
        .update(agentInboxTable)
        .set({ expectsReply: 0.21 })
        .where(eq(agentInboxTable.dedupeKey, unsure.wakeMessage.id));
    await compose(unsure.runner, [unsure.wakeMessage]);
    expect(eventsFor(unsure.runner.runId)).toEqual([
        { chatId: unsure.seed.channelId, type: 'started' },
    ]);
});

test('Agent-authored messages and messages older than the last send never engage', async () => {
    const { runner, seed, wakeMessage } = await wakeOn(connection.db);
    // The Agent already answered after the wake message was written.
    await agentPost(connection.db, seed, seed.channelId);
    await compose(runner, [wakeMessage]);
    expect(eventsFor(runner.runId)).toEqual([]);

    const peerAgentId = createOpaqueId('agt');
    await connection.db.insert(agentsTable).values({
        computerId: seed.computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Cove',
        handle: `cove-${peerAgentId.slice(-6).toLowerCase()}`,
        homeTimezone: 'UTC',
        id: peerAgentId,
        serverId: seed.serverId,
    });
    const peer = await agentPost(connection.db, seed, seed.dmChatId, peerAgentId);
    await compose(runner, [peer]);
    expect(eventsFor(runner.runId)).toEqual([]);
});
