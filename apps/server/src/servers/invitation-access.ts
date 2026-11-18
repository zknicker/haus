import { canManageServerInvitations, type ServerInvitation } from '@haus/api';
import { type SQL, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverInvitationsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireServerMembership } from './server-access.ts';

export class InvitationAuthorityError extends Error {
    constructor() {
        super('Only a Server Owner or Admin can manage invitations.');
        this.name = 'InvitationAuthorityError';
    }
}

export class InvitationEmailTakenError extends Error {
    constructor(email: string) {
        super(`This Server already has a live invitation for ${email}.`);
        this.name = 'InvitationEmailTakenError';
    }
}

export class InvitationNotFoundError extends Error {
    constructor() {
        super('No live invitation exists on this Server with that id.');
        this.name = 'InvitationNotFoundError';
    }
}

/**
 * One answer for unknown, revoked, consumed, and lapsed tokens, so holding a
 * token never reveals whether it once existed.
 */
export class InvitationNotAcceptableError extends Error {
    constructor() {
        super('That invitation is no longer available.');
        this.name = 'InvitationNotAcceptableError';
    }
}

export class InvitationEmailMismatchError extends Error {
    constructor() {
        super('This invitation is for a different verified email address.');
        this.name = 'InvitationEmailMismatchError';
    }
}

export class AlreadyServerMemberError extends Error {
    constructor() {
        super('You are already a member of this Haus server.');
        this.name = 'AlreadyServerMemberError';
    }
}

/**
 * Every invitation surface resolves current Server membership first, then the
 * Owner/Admin rule. A human outside the Server is refused as a non-member so a
 * token or invitation id never confirms that another Server exists.
 */
export async function requireInvitationAuthority(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);

    if (!canManageServerInvitations(server.role)) {
        throw new InvitationAuthorityError();
    }

    return server;
}

/** Live invitations are `pending`; every other state is terminal. */
export function invitationStatus(): SQL<ServerInvitation['status']> {
    return sql<ServerInvitation['status']>`
        case
            when ${serverInvitationsTable.acceptedAt} is not null then 'accepted'
            when ${serverInvitationsTable.revokedAt} is not null then 'revoked'
            when ${serverInvitationsTable.expiresAt} <= now() then 'expired'
            else 'pending'
        end
    `;
}

export const invitationColumns = {
    createdAt: serverInvitationsTable.createdAt,
    email: serverInvitationsTable.email,
    expiresAt: serverInvitationsTable.expiresAt,
    id: serverInvitationsTable.id,
    invitedByUserId: serverInvitationsTable.invitedByUserId,
    status: invitationStatus(),
};

export interface InvitationRow {
    createdAt: Date;
    email: string;
    expiresAt: Date;
    id: string;
    invitedByUserId: string;
    status: ServerInvitation['status'];
}

export function toServerInvitation(row: InvitationRow): ServerInvitation {
    return {
        createdAt: row.createdAt.toISOString(),
        email: row.email,
        expiresAt: row.expiresAt.toISOString(),
        id: row.id,
        invitedByUserId: row.invitedByUserId,
        status: row.status,
    };
}
