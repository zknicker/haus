import {
    requiresSlugConfirmation,
    resolveServerMemberAuthority,
    type ServerMemberAction,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    findCurrentMembership,
    isLastOwner,
    ServerConfirmationError,
    ServerMemberAuthorityError,
    ServerMemberNotFoundError,
} from './member-access.ts';
import { clearPersonalWork } from './member-personal-work.ts';
import { requireServerMembership } from './server-access.ts';
import { lockServerRow } from './server-lock.ts';

export interface RemovedServerMember {
    /** Chats the human just lost, so live surfaces can drop volatile state. */
    departedChatIds: string[];
    serverId: string;
    userId: string;
}

export interface RemoveServerMemberInput {
    confirmation: string;
    serverId: string;
    /** Absent when a human is leaving on their own behalf. */
    userId?: string;
}

/**
 * Ends one human's standing on one Server. Everything durable commits in a
 * single transaction under the Server lock: the revocation, the personal work
 * they held, and the last-Owner check that guards it.
 *
 * The membership row is revoked rather than deleted. Authored messages, DM
 * pairs, and read events point at it, so deleting the row would take
 * collaboration history with it.
 */
export async function removeServerMember(
    db: HausDatabase,
    member: HausUser | null,
    input: RemoveServerMemberInput
): Promise<RemovedServerMember> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);

        const server = await requireServerMembership(tx, member, input.serverId);

        if (!member) {
            throw new Error('A Server member is required to change membership.');
        }

        const targetUserId = input.userId ?? member.id;
        const isLeaving = input.userId === undefined;
        const target = await findCurrentMembership(tx, server.id, targetUserId);

        if (!target) {
            throw new ServerMemberNotFoundError();
        }

        const action: ServerMemberAction = isLeaving ? { kind: 'leave' } : { kind: 'remove' };
        const decision = resolveServerMemberAuthority({
            action,
            actorRole: server.role,
            actorUserId: member.id,
            targetIsLastOwner: await isLastOwner(tx, server.id, target),
            targetRole: target.role,
            targetUserId: target.userId,
        });

        if (!decision.allowed) {
            throw new ServerMemberAuthorityError(decision.reason);
        }

        if (requiresSlugConfirmation(action, target.role) && input.confirmation !== server.slug) {
            throw new ServerConfirmationError(server.slug);
        }

        await tx
            .update(serverMembershipsTable)
            .set({ revokedAt: sql`now()` })
            .where(
                and(
                    eq(serverMembershipsTable.serverId, server.id),
                    eq(serverMembershipsTable.userId, target.userId)
                )
            );

        const departedChatIds = await clearPersonalWork(tx, server.id, target.userId);

        return { departedChatIds, serverId: server.id, userId: target.userId };
    });
}
