import type { ServerInvitation } from '@haus/api';
import { desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverInvitationsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    invitationColumns,
    requireInvitationAuthority,
    toServerInvitation,
} from './invitation-access.ts';

/** Invitations an Owner or Admin may see. Tokens and hashes are never read. */
export async function listServerInvitations(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<ServerInvitation[]> {
    const server = await requireInvitationAuthority(db, member, serverId);
    const rows = await db
        .select(invitationColumns)
        .from(serverInvitationsTable)
        .where(eq(serverInvitationsTable.serverId, server.id))
        .orderBy(desc(serverInvitationsTable.createdAt));

    return rows.map(toServerInvitation);
}
