import {
    requiresSlugConfirmation,
    resolveServerMemberAuthority,
    type ServerMember,
    type ServerMemberAction,
    type ServerRole,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    findCurrentMembership,
    isLastOwner,
    ServerConfirmationError,
    ServerMemberAuthorityError,
    ServerMemberNotFoundError,
    toServerMember,
} from './member-access.ts';
import { requireServerMembership } from './server-access.ts';
import { lockServerRow } from './server-lock.ts';

export interface ChangeServerMemberRoleInput {
    confirmation?: string;
    role: ServerRole;
    serverId: string;
    userId: string;
}

/**
 * Moves one human between Member, Admin, and Owner. The Server row is locked
 * first so the last-Owner count is settled for the whole transaction, and both
 * the shared authority rule and the typed confirmation are judged here — the
 * App's version of either is presentation only.
 */
export async function changeServerMemberRole(
    db: HausDatabase,
    member: HausUser | null,
    input: ChangeServerMemberRoleInput
): Promise<ServerMember> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);

        const server = await requireServerMembership(tx, member, input.serverId);

        if (!member) {
            throw new Error('A Server member is required to change a role.');
        }

        const target = await findCurrentMembership(tx, server.id, input.userId);

        if (!target) {
            throw new ServerMemberNotFoundError();
        }

        const action: ServerMemberAction = { kind: 'changeRole', nextRole: input.role };
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
            .set({ role: input.role })
            .where(
                and(
                    eq(serverMembershipsTable.serverId, server.id),
                    eq(serverMembershipsTable.userId, target.userId)
                )
            );

        return toServerMember({ ...target, role: input.role });
    });
}
