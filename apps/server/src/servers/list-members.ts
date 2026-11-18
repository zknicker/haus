import type { ServerMemberDirectory } from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable, usersTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { toServerMember } from './member-access.ts';
import { requireServerMembership } from './server-access.ts';

/**
 * Every current member can see who else is on the Server. The App needs it to
 * name authors and to drop live signals from humans who have left; management
 * affordances are gated by the viewer's own role, which rides along here.
 */
export async function listServerMembers(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<ServerMemberDirectory> {
    const server = await requireServerMembership(db, member, serverId);

    if (!member) {
        throw new Error('A Server member is required to read the member directory.');
    }

    const memberships = await db
        .select({
            avatarId: usersTable.avatarId,
            description: usersTable.description,
            displayName: usersTable.displayName,
            email: usersTable.email,
            handle: serverMembershipsTable.handle,
            joinedAt: serverMembershipsTable.joinedAt,
            role: serverMembershipsTable.role,
            timezone: usersTable.timezone,
            userId: serverMembershipsTable.userId,
        })
        .from(serverMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
        .where(
            and(
                eq(serverMembershipsTable.serverId, server.id),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .orderBy(asc(serverMembershipsTable.joinedAt), asc(serverMembershipsTable.userId));

    return {
        members: memberships.map(toServerMember),
        viewerRole: server.role,
        viewerUserId: member.id,
    };
}
