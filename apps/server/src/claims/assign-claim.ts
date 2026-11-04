import type { MessageClaim } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type ClaimActor,
    claimActorHandle,
    lockClaimMemberships,
    requireClaimActorWrite,
} from './claim-actor.ts';
import { deliverClaimAssignment } from './claim-assignment-delivery.ts';
import { ClaimConflictError, ClaimNotFoundError } from './claim-errors.ts';
import { prepareClaimEvent } from './claim-events.ts';
import { findMessageClaim } from './claim-shape.ts';
import { resolveClaimAssignee } from './resolve-claim-assignee.ts';

export class ClaimClosedAssignError extends Error {
    constructor() {
        super('A finished claim cannot be assigned. Reopen it first.');
        this.name = 'ClaimClosedAssignError';
    }
}

/** Only an Agent holds a claim (ADR 0037); null unassigns. */
export type ClaimAssigneeInput = { agentId: string } | null;

/**
 * Assignment updates the claim and hands the assignee a typed delivery, so it
 * carries a list of events rather than the single event the other claim
 * mutations return, plus the Agents to wake.
 */
export interface ClaimAssignResult {
    claim: MessageClaim;
    events: PreparedRealtimeEvent[];
    wakes: string[];
}

/**
 * Moves who a claim belongs to, and nothing else: status never changes and any
 * claim stamp clears, so the new owner still claims before starting. Any
 * member who can write in the claim's Chat may assign it to any Agent of that
 * Chat, including over another Agent's hold (Raft parity). `expectedVersion`
 * is optional for Agents, whose `--expected-revision` is opt-in.
 */
export async function assignClaim(
    db: HausDatabase,
    actor: ClaimActor | null,
    agentDelivery: AgentDelivery,
    input: {
        assignee: ClaimAssigneeInput;
        expectedVersion?: number;
        messageId: string;
        serverId: string;
    }
): Promise<ClaimAssignResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!actor) {
            throw new ClaimNotFoundError();
        }
        const beforeLock = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!beforeLock) {
            throw new ClaimNotFoundError();
        }
        await lockClaimMemberships(tx, input.serverId, [
            ...(actor.kind === 'human' ? [actor.member.id] : []),
        ]);
        if (actor.kind === 'human') {
            await requireServerMembership(tx, actor.member, input.serverId);
        }
        await requireClaimActorWrite(tx, actor, {
            chatId: beforeLock.chatId,
            serverId: input.serverId,
        });
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${beforeLock.chatId}
            for update
        `);
        await tx.execute(sql`
            select message_id from message_claims
            where server_id = ${input.serverId} and message_id = ${input.messageId}
            for update
        `);

        const current = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!current) {
            throw new ClaimNotFoundError();
        }
        if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
            throw new ClaimConflictError(
                `That claim changed (revision ${current.version}, expected ${input.expectedVersion}); refresh it before assigning.`
            );
        }
        if (current.status === 'done' || current.status === 'closed') {
            throw new ClaimClosedAssignError();
        }
        const assignee = await resolveClaimAssignee(tx, {
            assignee: input.assignee,
            chatId: current.chatId,
            serverId: input.serverId,
        });
        // Re-assigning the current owner is success, not a version bump that
        // would invalidate everyone else's expected revision.
        if (current.assigneeAgentId === assignee.agentId) {
            return { events: [], claim: current, wakes: [] };
        }

        await tx
            .update(messageClaimsTable)
            .set({
                assigneeAgentId: assignee.agentId,
                // Assignment reserves; it never carries a claim. The new owner
                // takes the lock itself before starting work.
                claimedAt: null,
                updatedAt: sql`now()`,
                version: sql`${messageClaimsTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageClaimsTable.serverId, input.serverId),
                    eq(messageClaimsTable.messageId, input.messageId)
                )
            );
        const claimEvent = prepareClaimEvent({
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: input.serverId,
            threadChatId: current.threadChatId,
            type: 'claim.updated',
        });
        const events: PreparedRealtimeEvent[] = claimEvent ? [claimEvent] : [];
        const claim = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!claim) {
            throw new ClaimNotFoundError();
        }

        const assignsOtherAgent =
            assignee.agentId !== null &&
            !(actor.kind === 'agent' && actor.agentId === assignee.agentId);
        if (!(assignee.agentId && assignsOtherAgent)) {
            return { events, claim, wakes: [] };
        }
        await deliverClaimAssignment(tx, agentDelivery, {
            agentId: assignee.agentId,
            assignedByHandle: await claimActorHandle(tx, actor, input.serverId),
            serverId: input.serverId,
            claim,
        });
        return { events, claim, wakes: [assignee.agentId] };
    });
}
