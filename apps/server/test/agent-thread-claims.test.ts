import { afterAll, beforeAll, expect, test } from 'bun:test';
import { assignAgentClaim } from '../src/agent-api/claim-assign.ts';
import { claimAgentClaims } from '../src/agent-api/claim-claim.ts';
import { createAgentClaims } from '../src/agent-api/claim-create.ts';
import { listAgentClaims } from '../src/agent-api/claim-list.ts';
import { updateAgentClaim } from '../src/agent-api/claims.ts';
import { advanceSeenCursor } from '../src/agent-delivery/cursors.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { findMessageClaim } from '../src/claims/claim-shape.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { publishRealtime } from '../src/realtime/topic.ts';
import { seedAgentRunner, seedThreadClaimScene } from './agent-thread-claim-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

/**
 * An Agent claims the Thread message it was asked in. The claim is numbered and
 * owned by the Thread's parent, sits on the Thread message, and is worked in
 * the Thread it sits in.
 */

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_thread_claims'));
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('claiming a Thread message makes a Thread claim numbered by the parent', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-claim');
    // A top-level claim first, so the Thread claim proves it draws the parent's sequence.
    await owner.trpc.claim.create.mutate({
        chatId: scene.chatId,
        content: 'Top-level work',
        nonce: 'thread-claim:top',
        serverId: scene.serverId,
    });

    const claimed = await claimAgentClaims(connection.db, scene.runner, {
        messageId: scene.replyId.slice(4, 12),
        target: scene.threadTarget,
    });

    expect(claimed.results).toMatchObject([{ number: 2, outcome: 'claimed' }]);
    expect(claimed.results[0]?.claim).toMatchObject({
        assignee: { handle: 'piper' },
        message: { chat_id: scene.threadChatId, id: scene.replyId },
        number: 2,
        // The Thread's own address, never `<thread target>:<short id>`.
        target: scene.threadTarget,
    });
    // The event names the Message's Chat, so the App refreshes the Thread's row.
    expect(claimed.events.map(({ delivery: { event } }) => event)).toEqual([
        expect.objectContaining({ chatId: scene.threadChatId, kind: 'created' }),
    ]);
    const [row] = (await harness.sql`
        select chat_id, thread_chat_id, message_chat_id, origin, status from message_claims
        where server_id = ${scene.serverId} and message_id = ${scene.replyId}
    `) as Record<string, string>[];
    expect(row).toEqual({
        chat_id: scene.chatId,
        message_chat_id: scene.threadChatId,
        origin: 'claimed',
        status: 'in_progress',
        thread_chat_id: scene.threadChatId,
    });
    expect(await findMessageClaim(connection.db, scene.serverId, scene.replyId)).toMatchObject({
        chatId: scene.chatId,
        origin: 'claimed',
        threadChatId: scene.threadChatId,
    });
    // The claimant follows the Thread the claim sits in.
    const follows = (await harness.sql`
        select thread_chat_id, followed from agent_thread_follows
        where server_id = ${scene.serverId} and agent_id = ${scene.runner.agentId}
    `) as Array<{ followed: boolean; thread_chat_id: string }>;
    expect(follows).toEqual([{ followed: true, thread_chat_id: scene.threadChatId }]);
});

test('a Thread claim answers to its number through the Thread target and the parent', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-lookup');
    const rook = await seedAgentRunner(
        harness,
        { chatId: scene.chatId, id: scene.serverId },
        'rook'
    );
    const [claim] = (
        await claimAgentClaims(connection.db, scene.runner, {
            messageId: scene.replyId,
            target: scene.threadTarget,
        })
    ).results;
    const number = claim?.number ?? 0;
    const parentTarget = `#${scene.chatName}`;

    const again = await claimAgentClaims(connection.db, scene.runner, {
        numbers: [number],
        target: parentTarget,
    });
    expect(again.results).toMatchObject([{ number, outcome: 'already_yours' }]);

    // The Agent has read the Thread, so a status change is not held for context.
    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 1,
        serverId: scene.serverId,
    });
    const review = await updateAgentClaim(connection.db, scene.runner, {
        number,
        status: 'in_review',
        target: scene.threadTarget,
    });
    expect(review.claim).toMatchObject({ number, status: 'in_review' });

    const handed = await assignAgentClaim(connection.db, scene.runner, delivery, {
        assignee: '@rook',
        number,
        target: parentTarget,
    });
    expect(handed.claim.assignee).toMatchObject({ handle: 'rook' });

    for (const target of [scene.threadTarget, parentTarget]) {
        const listed = await listAgentClaims(connection.db, rook, { target });
        expect(listed.claims.map((claim) => [claim.number, claim.target])).toEqual([
            [number, scene.threadTarget],
        ]);
    }
});

test('Thread claim changes reach a member who can see the parent, keyed to the Thread', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-events');
    const stream = collectStream(owner.trpc.claim.onChanged, { serverId: scene.serverId });
    await stream.started;

    const claimed = await claimAgentClaims(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });
    publishRealtime(claimed.events);
    const created = await stream.next((event) => event.messageId === scene.replyId);
    const claim = await findMessageClaim(connection.db, scene.serverId, scene.replyId);
    await owner.trpc.claim.update.mutate({
        expectedVersion: claim?.version ?? 0,
        messageId: scene.replyId,
        patch: { priority: 'high' },
        serverId: scene.serverId,
    });
    const updated = await stream.next((event) => event.kind === 'updated');
    stream.stop();

    for (const [event, kind] of [
        [created, 'created'],
        [updated, 'updated'],
    ] as const) {
        expect(event).toEqual({
            chatId: scene.threadChatId,
            kind,
            messageId: scene.replyId,
            serverId: scene.serverId,
        });
    }
});

test('a human still cannot convert a Thread message, even one an Agent claimed', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-human');
    await claimAgentClaims(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });

    await expect(
        owner.trpc.claim.promote.mutate({ messageId: scene.replyId, serverId: scene.serverId })
    ).rejects.toThrow(/top-level Channel or DM/i);
});

test('the claim list carries a Thread claim under its parent with the Thread summary', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-list');
    await claimAgentClaims(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });

    const hidden = await owner.trpc.claim.list.query({ serverId: scene.serverId });
    expect(hidden).toMatchObject({ backgroundCount: 1, claims: [] });
    const listed = await owner.trpc.claim.list.query({
        chatId: scene.chatId,
        includeBackground: true,
        serverId: scene.serverId,
    });

    expect(listed.claims).toHaveLength(1);
    expect(listed.claims[0]).toMatchObject({
        chatKind: 'channel',
        chatName: scene.chatName,
        message: { chatId: scene.threadChatId, id: scene.replyId },
        claim: { chatId: scene.chatId, threadChatId: scene.threadChatId },
        threadSummary: {
            anchorMessageId: scene.anchorId,
            replyCount: 1,
            threadChatId: scene.threadChatId,
        },
    });
});

test('an Agent creating its own claim records a claim; a handoff stays composed', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-create');
    await seedAgentRunner(harness, { chatId: scene.chatId, id: scene.serverId }, 'rook');
    const target = `#${scene.chatName}`;

    const mine = await createAgentClaims(
        connection.db,
        scene.runner,
        { assignee: '@piper', nonce: 'create-mine', target, titles: ['Draft the notes'] },
        delivery
    );
    const handoff = await createAgentClaims(
        connection.db,
        scene.runner,
        { assignee: '@rook', nonce: 'create-peer', target, titles: ['Review the notes'] },
        delivery
    );
    const open = await createAgentClaims(
        connection.db,
        scene.runner,
        { nonce: 'create-open', target, titles: ['Publish the notes'] },
        delivery
    );

    // A top-level claim keeps its Channel as its target.
    expect(mine.claims[0]?.target).toBe(target);
    const origins = await Promise.all(
        [mine, handoff, open].map(async (created) => {
            const claim = await findMessageClaim(
                connection.db,
                scene.serverId,
                created.claims[0]?.message.id ?? ''
            );
            return { origin: claim?.origin, status: claim?.status, tier: claim?.tier };
        })
    );
    expect(origins).toEqual([
        { origin: 'claimed', status: 'in_progress', tier: 'background' },
        { origin: 'composed', status: 'todo', tier: 'tracked' },
        { origin: 'composed', status: 'todo', tier: 'tracked' },
    ]);
    await expect(
        createAgentClaims(
            connection.db,
            scene.runner,
            { nonce: 'create-thread', target: scene.threadTarget, titles: ['Not here'] },
            delivery
        )
    ).rejects.toThrow('Claims require a top-level Channel or DM.');
});
