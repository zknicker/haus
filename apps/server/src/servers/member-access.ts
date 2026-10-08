import type { ServerMember, ServerMemberAuthorityRefusal, ServerRole } from '@haus/api';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { avatarUrlFor } from '../avatars/avatar-url.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable, usersTable } from '../postgres/schema.ts';

export class ServerMemberNotFoundError extends Error {
    constructor() {
        super('That human is not a current member of this Haus server.');
        this.name = 'ServerMemberNotFoundError';
    }
}

export class ServerConfirmationError extends Error {
    constructor(slug: string) {
        super(`Type the Server address ${slug} to confirm this change.`);
        this.name = 'ServerConfirmationError';
    }
}

/** A refusal from the shared Owner/Admin/Member rule, in product language. */
export class ServerMemberAuthorityError extends Error {
    readonly reason: ServerMemberAuthorityRefusal;

    constructor(reason: ServerMemberAuthorityRefusal) {
        super(refusalMessages[reason]);
        this.name = 'ServerMemberAuthorityError';
        this.reason = reason;
    }
}

const refusalMessages: Record<ServerMemberAuthorityRefusal, string> = {
    'last-owner': "This Server's last Owner cannot be removed, demoted, or leave.",
    'no-op': 'They already hold that role.',
    'not-self': 'You can only leave on your own behalf.',
    'peer-or-higher': 'An Admin cannot manage a peer Admin or an Owner.',
    'requires-admin': 'Only a Server Owner or Admin can manage members.',
    'requires-owner': 'Only an Owner can grant or revoke Owner authority.',
    'self-promotion': 'You cannot promote yourself.',
    'use-leave': 'Leave the Server instead of removing yourself.',
};

type MembershipReader = Pick<HausDatabase, 'select'>;

export interface CurrentMembership {
    avatarId: null | string;
    description?: null | string;
    displayName?: null | string;
    email?: null | string;
    handle?: null | string;
    joinedAt: Date;
    role: ServerRole;
    timezone?: null | string;
    userId: string;
}

/** One human's current standing, or nothing when they hold none. */
export async function findCurrentMembership(
    db: MembershipReader,
    serverId: string,
    userId: string
): Promise<CurrentMembership | null> {
    const [membership] = await db
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
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);

    return membership ?? null;
}

/**
 * Whether this human is the Server's only remaining Owner. Read under the
 * Server lock, so the answer cannot change before the caller commits.
 */
export async function isLastOwner(
    db: MembershipReader,
    serverId: string,
    target: CurrentMembership
): Promise<boolean> {
    if (target.role !== 'owner') {
        return false;
    }

    const [others] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.role, 'owner'),
                isNull(serverMembershipsTable.revokedAt),
                ne(serverMembershipsTable.userId, target.userId)
            )
        );

    return (others?.total ?? 0) === 0;
}

export function toServerMember(membership: CurrentMembership): ServerMember {
    return {
        avatarUrl: avatarUrlFor(membership.avatarId),
        description: membership.description ?? null,
        displayName: membership.displayName ?? null,
        email: membership.email ?? null,
        handle: membership.handle ?? null,
        joinedAt: membership.joinedAt.toISOString(),
        role: membership.role,
        timezone: membership.timezone ?? null,
        userId: membership.userId,
    };
}
