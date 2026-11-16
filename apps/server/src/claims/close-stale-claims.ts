import { CLAIM_IN_REVIEW_STALE_DAYS } from '@haus/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareClaimEvent } from './claim-events.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const staleMs = CLAIM_IN_REVIEW_STALE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Closes every `in_review` claim nobody has touched for the stale window: the
 * claim row itself unchanged, and its inline reply chain and work Thread (the
 * Thread anchored on it, or the Thread a Thread claim sits in) without a new
 * message. Review that went quiet is finished work
 * nobody said so about, and `closed` is reversible: a human reopens it through
 * the ordinary update path.
 *
 * Each close takes the same path a human update does — Server row lock, claim
 * row lock, version bump, `claim.updated` — so App caches invalidate exactly as
 * they do for an operator's change. Neither `message_claims` nor the claim events
 * carry an actor or a reason, so a stale close is indistinguishable from any
 * other close; nothing here invents a field to say otherwise.
 */
export async function closeStaleInReviewClaims(
    db: HausDatabase,
    now: Date
): Promise<PreparedRealtimeEvent[]> {
    const quietBefore = new Date(now.getTime() - staleMs);
    const candidates = await db
        .select({
            chatId: messageClaimsTable.chatId,
            threadChatId: messageClaimsTable.threadChatId,
            messageId: messageClaimsTable.messageId,
            serverId: messageClaimsTable.serverId,
        })
        .from(messageClaimsTable)
        .where(staleClaimFilter(quietBefore));
    const events: PreparedRealtimeEvent[] = [];
    for (const candidate of candidates) {
        const event = await closeStaleClaim(db, candidate, { now, quietBefore });
        if (event) {
            events.push(event);
        }
    }
    for (const event of events) {
        publishRealtime(event);
    }
    return events;
}

/** Runs the stale close on boot and hourly after that. */
export function startStaleClaimSweep(
    db: HausDatabase,
    clock: { now(): Date },
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'stale in-review claim sweep',
        run: () => closeStaleInReviewClaims(db, clock.now()),
        timers,
    });
}

async function closeStaleClaim(
    db: HausDatabase,
    claim: { chatId: string; messageId: string; serverId: string; threadChatId: string | null },
    window: { now: Date; quietBefore: Date }
): Promise<PreparedRealtimeEvent | null> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, claim.serverId);
        await tx.execute(sql`
            select message_id from message_claims
            where server_id = ${claim.serverId} and message_id = ${claim.messageId}
            for update
        `);
        // Re-read under the lock: a reply or an operator edit between the
        // candidate scan and this transaction takes the claim out of scope.
        const [current] = await tx
            .select({ messageId: messageClaimsTable.messageId })
            .from(messageClaimsTable)
            .where(
                and(
                    eq(messageClaimsTable.serverId, claim.serverId),
                    eq(messageClaimsTable.messageId, claim.messageId),
                    staleClaimFilter(window.quietBefore)
                )
            )
            .limit(1);
        if (!current) {
            return null;
        }
        await tx
            .update(messageClaimsTable)
            .set({
                status: 'closed',
                updatedAt: window.now,
                version: sql`${messageClaimsTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageClaimsTable.serverId, claim.serverId),
                    eq(messageClaimsTable.messageId, claim.messageId)
                )
            );
        return prepareClaimEvent({
            chatId: claim.chatId,
            messageId: claim.messageId,
            serverId: claim.serverId,
            threadChatId: claim.threadChatId,
            type: 'claim.updated',
        });
    });
}

function staleClaimFilter(quietBefore: Date) {
    return and(
        eq(messageClaimsTable.status, 'in_review'),
        lt(messageClaimsTable.updatedAt, quietBefore),
        sql`not exists (
            select 1 from chat_messages inline_message
            join chat_messages claim_message
              on claim_message.server_id = ${messageClaimsTable.serverId}
             and claim_message.id = ${messageClaimsTable.messageId}
            where inline_message.server_id = ${messageClaimsTable.serverId}
              and inline_message.chat_id = ${messageClaimsTable.chatId}
              and inline_message.reply_to_message_id is not null
              and inline_message.reply_root_message_id = coalesce(
                  claim_message.reply_root_message_id, claim_message.id
              )
              and inline_message.created_at >= ${quietBefore}
        )`,
        sql`not exists (
            select 1
            from chat_messages stale_message
            join chats stale_thread
              on stale_thread.server_id = stale_message.server_id
             and stale_thread.id = stale_message.chat_id
            where stale_thread.server_id = ${messageClaimsTable.serverId}
              and stale_thread.kind = 'thread'
              and stale_thread.parent_chat_id = ${messageClaimsTable.chatId}
              and (
                  stale_thread.id = ${messageClaimsTable.threadChatId}
                  or (
                      ${messageClaimsTable.threadChatId} is null
                      and stale_thread.anchor_message_id = ${messageClaimsTable.messageId}
                  )
              )
              and stale_message.created_at >= ${quietBefore}
        )`
    );
}
