import { afterAll, beforeAll, expect, test } from 'bun:test';
import { claimAgentClaims } from '../src/agent-api/claim-claim.ts';
import { updateAgentClaim } from '../src/agent-api/claims.ts';
import { advanceSeenCursor } from '../src/agent-delivery/cursors.ts';
import { closeStaleInReviewClaims } from '../src/claims/close-stale-claims.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    seedThreadClaimScene,
    sendThreadReply,
    type ThreadClaimScene,
} from './agent-thread-claim-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * A Thread claim's work surface is the Thread it sits in, not a Thread anchored
 * on its own message (Threads never nest): context freshness and stale-review
 * activity both read the containing Thread.
 */

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_thread_life'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('new context in the containing Thread holds a status change until the Agent checks', async () => {
    const scene = await seedThreadClaimScene(harness, owner, 'thread-fresh');
    const number = await takeThreadClaim(scene);
    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 1,
        serverId: scene.serverId,
    });
    await sendThreadReply(owner, {
        anchorId: scene.anchorId,
        chatId: scene.chatId,
        content: 'Actually, include the migration notes too.',
        nonce: 'thread-fresh:later',
        serverId: scene.serverId,
    });

    await expect(
        updateAgentClaim(connection.db, scene.runner, {
            number,
            status: 'in_review',
            target: scene.threadTarget,
        })
    ).rejects.toThrow('New context exists in this claim thread.');

    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 2,
        serverId: scene.serverId,
    });
    const review = await updateAgentClaim(connection.db, scene.runner, {
        number,
        status: 'in_review',
        target: scene.threadTarget,
    });
    expect(review.claim).toMatchObject({ number, status: 'in_review' });
});

test('activity in the containing Thread keeps an in_review Thread claim open', async () => {
    const quiet = await seedThreadClaimScene(harness, owner, 'thread-stale-quiet');
    const busy = await seedThreadClaimScene(harness, owner, 'thread-stale-busy');
    for (const scene of [quiet, busy]) {
        await takeThreadClaim(scene);
        await backdateIntoReview(scene);
    }
    await sendThreadReply(owner, {
        anchorId: busy.anchorId,
        chatId: busy.chatId,
        content: 'Still reviewing this one.',
        nonce: 'thread-stale-busy:recent',
        serverId: busy.serverId,
    });

    const events = await closeStaleInReviewClaims(connection.db, new Date());

    const closed = events.map(({ delivery }) => delivery.event.messageId);
    expect(closed).toContain(quiet.replyId);
    expect(closed).not.toContain(busy.replyId);
    const rows = (await harness.sql`
        select message_id, status from message_claims
        where message_id in (${quiet.replyId}, ${busy.replyId})
        order by message_id = ${busy.replyId}
    `) as Array<{ message_id: string; status: string }>;
    expect(rows).toEqual([
        { message_id: quiet.replyId, status: 'closed' },
        { message_id: busy.replyId, status: 'in_review' },
    ]);
});

async function takeThreadClaim(scene: ThreadClaimScene) {
    const claimed = await claimAgentClaims(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });
    return claimed.results[0]?.number ?? 0;
}

/** Puts the claim in review and everything it has seen ten days back. */
async function backdateIntoReview(scene: ThreadClaimScene) {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await harness.sql`
        update message_claims set status = 'in_review', updated_at = ${tenDaysAgo}
        where server_id = ${scene.serverId} and message_id = ${scene.replyId}
    `;
    await harness.sql`
        update chat_messages set created_at = ${tenDaysAgo}
        where server_id = ${scene.serverId}
    `;
}
