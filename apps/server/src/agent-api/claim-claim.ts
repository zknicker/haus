import type { ClaimConflict } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { buildClaimConflict } from '../claims/claim-conflict.ts';
import { prepareClaimEvent } from '../claims/claim-events.ts';
import { claimHasOtherOwnerForAgent } from '../claims/claim-ownership.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { AgentClaimError } from './claim-error.ts';
import { hasUnseenClaimThreadContext } from './claim-freshness.ts';
import { queryAgentClaims, resolveAgentClaimTarget } from './claim-lookup.ts';
import { followClaim, promoteAgentMessageClaim } from './claim-promotion.ts';
import { type AgentClaimRow, claimRows } from './claim-row.ts';
import { resolveAgentMessage } from './message-read.ts';
import { messageSelection } from './message-view.ts';

type ClaimRecord = typeof messageClaimsTable.$inferSelect;

/** `already_yours` still authorizes work: re-confirming your own claim is supported. */
export type ClaimTakeOutcome = 'already_yours' | 'claimed' | 'refused';

export interface ClaimTakeResult {
    claim: AgentClaimRow | null;
    claimConflict: ClaimConflict | null;
    number: number;
    outcome: ClaimTakeOutcome;
    reason: string | null;
}

/**
 * Claims every requested claim in one transaction and answers per claim. A
 * refusal is a row outcome, not a thrown error, so a batch never commits some
 * claims and then fails the request: every granted claim reaches the caller
 * and its `claim.updated` event reaches the route.
 */
export async function claimAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { messageId?: string; numbers?: number[]; target: string }
) {
    const { chatId, claimChatId } = await resolveAgentClaimTarget(db, runner, input.target);
    const messageId = input.messageId
        ? (await resolveAgentMessage(db, runner, input.messageId)).id
        : undefined;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        const events: PreparedRealtimeEvent[] = [];
        const found = await queryAgentClaims(tx, runner, claimChatId, {
            messageId,
            numbers: input.numbers,
        });
        const outcomes: Array<Omit<ClaimTakeResult, 'claim'> & { messageId: string | null }> = [];
        if (found.length === 0 && messageId) {
            // `numbers` may have filtered out the message's own claim; promoting
            // it again would violate the one-claim-per-message key.
            const [existing] = await queryAgentClaims(tx, runner, claimChatId, { messageId });
            if (existing) {
                const taken = await takeClaimRow(tx, runner, existing.messageId);
                if (taken.event) {
                    events.push(taken.event);
                }
                outcomes.push(taken.outcome);
            } else {
                const promoted = await promoteAgentMessageClaim(tx, runner, chatId, messageId);
                events.push(promoted.event);
                outcomes.push(grant(promoted.claim, 'claimed'));
            }
        } else if (found.length === 0 && !input.numbers?.length) {
            throw new AgentClaimError('No matching claim exists in that target.');
        }
        const byNumber = new Map(found.map((claim) => [claim.number, claim]));
        const requested = input.numbers?.length
            ? [...new Set(input.numbers)]
            : found.map((claim) => claim.number);
        for (const number of requested) {
            const claim = byNumber.get(number);
            if (!claim) {
                outcomes.push(refuse(number, null, `No claim #${number} exists in that target.`));
                continue;
            }
            const taken = await takeClaimRow(tx, runner, claim.messageId);
            if (taken.event) {
                events.push(taken.event);
            }
            outcomes.push(taken.outcome);
        }
        const projections = await readClaimProjections(
            tx,
            runner,
            outcomes.flatMap((row) => row.messageId ?? [])
        );
        const results: ClaimTakeResult[] = outcomes.map(({ messageId: id, ...row }) => ({
            ...row,
            claim: id ? (projections.get(id) ?? null) : null,
        }));
        return { events, results };
    });
}

async function takeClaimRow(tx: HausDatabase, runner: ResolvedRunner, messageId: string) {
    const [current] = await tx
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, runner.serverId),
                eq(messageClaimsTable.messageId, messageId)
            )
        )
        .for('update');
    if (!current) {
        throw new AgentClaimError('That claim no longer exists.');
    }
    if (current.assigneeAgentId === runner.agentId && current.claimedAt !== null) {
        await followClaim(tx, runner, current, 'reconfirm');
        return { event: null, outcome: grant(current, 'already_yours') };
    }
    // Only the holder decides a claim. The row is locked under the Server
    // lock, so status edits since the caller last read the claim cannot make
    // the claim stale.
    if (claimHasOtherOwnerForAgent(current, runner.agentId)) {
        const conflict = await buildClaimConflict(tx, runner.serverId, current, new Date());
        return {
            event: null,
            outcome: {
                ...refuse(
                    current.number,
                    current.messageId,
                    'That claim is already owned by another assignee.'
                ),
                claimConflict: conflict,
            },
        };
    }
    if (current.status === 'done') {
        return {
            event: null,
            outcome: refuse(current.number, current.messageId, 'Done claims cannot be claimed.'),
        };
    }
    if (await hasUnseenClaimThreadContext(tx, runner, current)) {
        return {
            event: null,
            outcome: refuse(
                current.number,
                current.messageId,
                'New context exists in this claim thread. Run haus message check before retrying.'
            ),
        };
    }
    await tx
        .update(messageClaimsTable)
        .set({
            assigneeAgentId: runner.agentId,
            claimedAt: sql`now()`,
            status: current.status === 'todo' ? 'in_progress' : current.status,
            updatedAt: sql`now()`,
            version: sql`${messageClaimsTable.version} + 1`,
        })
        .where(
            and(
                eq(messageClaimsTable.serverId, runner.serverId),
                eq(messageClaimsTable.messageId, messageId)
            )
        );
    await followClaim(tx, runner, current, 'fresh');
    const event = prepareClaimEvent({
        chatId: current.chatId,
        messageId,
        serverId: runner.serverId,
        threadChatId: current.threadChatId,
        type: 'claim.updated',
    });
    return { event, outcome: grant(current, 'claimed') };
}

async function readClaimProjections(tx: HausDatabase, runner: ResolvedRunner, ids: string[]) {
    if (ids.length === 0) {
        return new Map<string, AgentClaimRow>();
    }
    const rows = await tx
        .select({ message: messageSelection, claim: messageClaimsTable })
        .from(messageClaimsTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageClaimsTable.serverId),
                eq(chatMessagesTable.id, messageClaimsTable.messageId)
            )
        )
        .where(
            and(
                eq(messageClaimsTable.serverId, runner.serverId),
                inArray(messageClaimsTable.messageId, ids)
            )
        );
    const projected = await claimRows(tx, runner, rows);
    return new Map(rows.map((row, index) => [row.claim.messageId, projected[index]]));
}

function grant(claim: ClaimRecord, outcome: 'already_yours' | 'claimed') {
    return {
        claimConflict: null,
        messageId: claim.messageId,
        number: claim.number,
        outcome,
        reason: null,
    };
}

function refuse(number: number, messageId: string | null, reason: string) {
    return {
        claimConflict: null as ClaimConflict | null,
        messageId,
        number,
        outcome: 'refused' as const,
        reason,
    };
}
