import { and, eq, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimLabelsTable, messageClaimsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskLabelIds } from '../task-labels/task-labels.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    ClaimConflictError,
    type ClaimMutationResult,
    ClaimNotFoundError,
} from './claim-errors.ts';
import { lockClaimPlacement, prepareClaimEvent } from './claim-events.ts';
import { findMessageClaim } from './claim-shape.ts';
import { type ClaimStatus, claimStatusColumns } from './claim-status-transitions.ts';

export async function updateClaim(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        expectedVersion: number;
        messageId: string;
        patch: {
            labelIds?: string[];
            priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low';
            status?: 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';
        };
        serverId: string;
    }
): Promise<ClaimMutationResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new ClaimNotFoundError();
        }
        const beforeLock = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!beforeLock) {
            throw new ClaimNotFoundError();
        }
        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);
        await requireChatWriteAccess(tx, member, {
            chatId: beforeLock.chatId,
            serverId: input.serverId,
        });
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${beforeLock.chatId}
            for update
        `);
        const placement = await lockClaimPlacement(tx, input.serverId, input.messageId);
        const current = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!(placement && current)) {
            throw new ClaimNotFoundError();
        }
        if (current.version !== input.expectedVersion) {
            throw new ClaimConflictError('That claim changed; refresh it before updating.');
        }
        if (input.patch.labelIds) {
            await requireTaskLabelIds(tx, input.serverId, input.patch.labelIds);
            await tx
                .delete(messageClaimLabelsTable)
                .where(
                    and(
                        eq(messageClaimLabelsTable.serverId, input.serverId),
                        eq(messageClaimLabelsTable.messageId, input.messageId)
                    )
                );
            const labelIds = [...new Set(input.patch.labelIds)];
            if (labelIds.length > 0) {
                await tx.insert(messageClaimLabelsTable).values(
                    labelIds.map((labelId) => ({
                        labelId,
                        messageId: input.messageId,
                        serverId: input.serverId,
                    }))
                );
            }
        }
        await tx
            .update(messageClaimsTable)
            .set(claimPatchColumns(current, input.patch))
            .where(
                and(
                    eq(messageClaimsTable.serverId, input.serverId),
                    eq(messageClaimsTable.messageId, input.messageId)
                )
            );
        const event = prepareClaimEvent({
            ...placement,
            serverId: input.serverId,
            type: 'claim.updated',
        });
        const claim = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!claim) {
            throw new ClaimNotFoundError();
        }
        return { event, claim };
    });
}

/**
 * People in the App set status freely (member-level, no transition table);
 * the shared columns keep the claim stamp and tracked tier consistent with the
 * Agent path. An unchanged status is not a status change.
 */
function claimPatchColumns(
    current: Parameters<typeof claimStatusColumns>[0],
    patch: {
        priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low';
        status?: ClaimStatus;
    }
) {
    return {
        ...(patch.priority ? { priority: patch.priority } : {}),
        ...(patch.status && patch.status !== current.status
            ? claimStatusColumns(current, patch.status)
            : {}),
        updatedAt: sql`now()`,
        version: sql`${messageClaimsTable.version} + 1`,
    };
}
