import { afterAll, beforeAll, expect, test } from 'bun:test';
import { closeStaleInReviewClaims } from '../src/claims/close-stale-claims.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { claimChangedTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureTopic, settleRealtime } from './realtime-capture.ts';

/**
 * Review that went quiet for `CLAIM_IN_REVIEW_STALE_DAYS` is closed by Server
 * through the ordinary update path, so App caches invalidate on the same
 * `claim.updated` event a human's change emits.
 */

let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

const sweptAt = new Date('2026-09-04T12:00:00.000Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_stale_claims'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Stale Review Server',
        slug: 'stale-review-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('closes an in_review claim whose Thread has been quiet for eight days', async () => {
    const claim = await createClaim('Ship the retention sweep', 'stale-quiet', 'in_review');
    await backdate(claim.messageId, daysBeforeSweep(8));

    const delivered = captureTopic(claimChangedTopic);
    const events = await closeStaleInReviewClaims(connection.db, sweptAt);

    expect(events.map(({ delivery }) => delivery.event)).toEqual([
        { chatId, kind: 'updated', messageId: claim.messageId, serverId },
    ]);
    const closed = await readClaim(claim.messageId);
    expect(closed).toMatchObject({ status: 'closed', version: claim.version + 1 });
    await settleRealtime();
    expect(delivered.events).toContainEqual(
        expect.objectContaining({ kind: 'updated', messageId: claim.messageId })
    );
    delivered.stop();
});

test('keeps an in_review claim whose Thread was answered two days ago', async () => {
    const claim = await createClaim('Review the migration', 'stale-answered', 'in_review');
    await backdate(claim.messageId, daysBeforeSweep(9));
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Still looking at this.',
        nonce: 'stale-answered-reply',
        serverId,
        thread: { anchorMessageId: claim.messageId },
    });
    await harness.sql`
        update chat_messages set created_at = ${daysBeforeSweep(2)}
        where nonce = 'stale-answered-reply' and server_id = ${serverId}
    `;

    const events = await closeStaleInReviewClaims(connection.db, sweptAt);

    expect(events.map((event) => event.messageId)).not.toContain(claim.messageId);
    expect(await readClaim(claim.messageId)).toMatchObject({
        status: 'in_review',
        version: claim.version,
    });
});

test('a recent inline follow-up keeps review open while unrelated channel activity does not', async () => {
    const active = await createClaim('Review the reply flow', 'inline-active', 'in_review');
    const quiet = await createClaim('Review an unrelated change', 'inline-quiet', 'in_review');
    await backdate(active.messageId, daysBeforeSweep(9));
    await backdate(quiet.messageId, daysBeforeSweep(9));
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'I have one follow-up on this review.',
        nonce: 'inline-review-followup',
        replyToMessageId: active.messageId,
        serverId,
    });
    await harness.sql`
        update chat_messages set created_at = ${daysBeforeSweep(2)}
        where nonce = 'inline-review-followup' and server_id = ${serverId}
    `;

    const events = await closeStaleInReviewClaims(connection.db, sweptAt);
    expect(events.map((event) => event.messageId)).not.toContain(active.messageId);
    expect(await readClaim(active.messageId)).toMatchObject({ status: 'in_review' });
    expect(await readClaim(quiet.messageId)).toMatchObject({ status: 'closed' });
});

test('leaves an in_progress claim alone however long it has been quiet', async () => {
    const claim = await createClaim('Long-running migration', 'stale-in-progress', 'in_progress');
    await backdate(claim.messageId, daysBeforeSweep(30));

    const events = await closeStaleInReviewClaims(connection.db, sweptAt);

    expect(events.map((event) => event.messageId)).not.toContain(claim.messageId);
    expect(await readClaim(claim.messageId)).toMatchObject({
        status: 'in_progress',
        version: claim.version,
    });
});

async function createClaim(content: string, nonce: string, status: 'in_progress' | 'in_review') {
    const created = await owner.trpc.claim.create.mutate({ chatId, content, nonce, serverId });
    const updated = await owner.trpc.claim.update.mutate({
        expectedVersion: created.claim.version,
        messageId: created.claim.messageId,
        patch: { status },
        serverId,
    });
    return {
        messageId: updated.claim.messageId,
        version: updated.claim.version,
    };
}

/** Ages the claim row and every message already in its Thread. */
async function backdate(messageId: string, quietSince: Date) {
    await harness.sql`
        update message_claims set updated_at = ${quietSince}
        where server_id = ${serverId} and message_id = ${messageId}
    `;
    await harness.sql`
        update chat_messages set created_at = ${quietSince}
        where server_id = ${serverId}
          and chat_id in (
            select id from chats
            where server_id = ${serverId} and kind = 'thread' and anchor_message_id = ${messageId}
          )
    `;
}

async function readClaim(messageId: string) {
    const [row] = (await harness.sql`
        select status, version from message_claims
        where server_id = ${serverId} and message_id = ${messageId}
    `) as { status: string; version: number }[];
    return row;
}

function daysBeforeSweep(days: number) {
    return new Date(sweptAt.getTime() - days * 24 * 60 * 60 * 1000);
}
