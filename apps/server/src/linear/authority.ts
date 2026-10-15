import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearIdentitiesTable,
    linearWorkspacesTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { LinearRefusedError, linearAdminRequired } from './linear-errors.ts';

// Haus-side authority for the Linear connection: Owner or Admin for binding
// and identities, membership for reads, and grant checks for Agents.

/** Binding is Server Owner or Admin work; rechecked under the lock at callback. */
export async function requireAdminRole(
    db: HausDatabase,
    serverId: string,
    userId: string
): Promise<void> {
    const [membership] = await db
        .select({ role: serverMembershipsTable.role })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, userId)
            )
        )
        .limit(1);
    if (membership?.role !== 'owner' && membership?.role !== 'admin') {
        throw linearAdminRequired();
    }
}

/** A Server member who is an Owner or Admin; answers their user id. */
export async function requireLinearAdmin(
    db: HausDatabase,
    member: { id: string } | null,
    serverId: string
): Promise<string> {
    const access = await requireServerMembership(db, member, serverId);
    if (!member || (access.role !== 'owner' && access.role !== 'admin')) {
        throw linearAdminRequired();
    }
    return member.id;
}

/** The live workspace behind one of this Server's Linear connections, or NOT_FOUND. */
export async function requireLinearWorkspace(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
) {
    const [workspace] = await db
        .select()
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, input.serverId),
                eq(linearWorkspacesTable.connectionId, input.connectionId),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .limit(1);
    if (!workspace?.connectionId) {
        throw new LinearRefusedError(
            'NOT_FOUND',
            'linear_connection_not_found',
            'That Linear connection was not found on this Server.'
        );
    }
    return { ...workspace, connectionId: workspace.connectionId };
}

/** One live identity on this Server, or NOT_FOUND. */
export async function requireLinearIdentity(
    db: HausDatabase,
    input: { identityId: string; serverId: string }
) {
    const [identity] = await db
        .select()
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.serverId, input.serverId),
                eq(linearIdentitiesTable.id, input.identityId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .limit(1);
    if (!identity) {
        throw new LinearRefusedError(
            'NOT_FOUND',
            'linear_identity_not_found',
            'That Linear identity was not found on this Server.'
        );
    }
    return identity;
}

export async function holdsGrant(
    db: HausDatabase,
    input: { agentId: string; connectionId: string; serverId: string }
): Promise<boolean> {
    const [grant] = await db
        .select({ agentId: agentMcpConnectionGrantsTable.agentId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                eq(agentMcpConnectionGrantsTable.agentId, input.agentId),
                eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId)
            )
        )
        .limit(1);
    return grant !== undefined;
}

/** The live (not removed) workspace bound through this connection. */
export async function liveWorkspace(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
): Promise<typeof linearWorkspacesTable.$inferSelect | null> {
    const [row] = await db
        .select()
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, input.serverId),
                eq(linearWorkspacesTable.connectionId, input.connectionId),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .limit(1);
    return row ?? null;
}
