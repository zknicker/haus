import type { GithubInstallation } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable, mcpConnectionsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { GithubRefusedError } from './github-errors.ts';

// Haus-side authority and reads for the GitHub connection's installations.

type InstallationRow = typeof githubInstallationsTable.$inferSelect;

/** Binding and removal are Server Owner or Admin work. */
export async function requireGithubAdmin(
    db: HausDatabase,
    member: { id: string } | null,
    serverId: string
): Promise<void> {
    const access = await requireServerMembership(db, member, serverId);
    if (access.role !== 'owner' && access.role !== 'admin') {
        throw new GithubRefusedError(
            'FORBIDDEN',
            'github_admin_required',
            'Only a Server Owner or Admin can manage GitHub installations.'
        );
    }
}

/** The Server's GitHub connection, or NOT_FOUND for any other connection. */
export async function requireGithubConnection(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
) {
    const [connection] = await db
        .select()
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, input.serverId),
                eq(mcpConnectionsTable.id, input.connectionId),
                eq(mcpConnectionsTable.preset, 'github')
            )
        )
        .limit(1);
    if (!connection) {
        throw new GithubRefusedError(
            'NOT_FOUND',
            'github_connection_not_found',
            'That GitHub connection was not found on this Server.'
        );
    }
    return connection;
}

/** One live (not removed) installation on this Server, or NOT_FOUND. */
export async function requireLiveGithubInstallation(
    db: HausDatabase,
    input: { installationId: string; serverId: string }
): Promise<InstallationRow> {
    const [row] = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                eq(githubInstallationsTable.id, input.installationId)
            )
        )
        .limit(1);
    if (!row || row.status === 'removed' || !row.connectionId) {
        throw new GithubRefusedError(
            'NOT_FOUND',
            'github_installation_not_found',
            'That GitHub installation is not bound to this Server.'
        );
    }
    return row;
}

/** The connection's bound installations, oldest first. Tombstones belong to no connection. */
export async function listGithubInstallations(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
): Promise<GithubInstallation[]> {
    const rows = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                eq(githubInstallationsTable.connectionId, input.connectionId)
            )
        )
        .orderBy(githubInstallationsTable.createdAt);
    return rows.map(shapeGithubInstallation);
}

export function shapeGithubInstallation(row: InstallationRow): GithubInstallation {
    return {
        accessibleRepositoryCount: row.accessibleRepositoryIds.length,
        accessSyncedAt: row.accessSyncedAt?.toISOString() ?? null,
        account: { id: row.accountId, login: row.accountLogin, type: row.accountType },
        connectionId: row.connectionId,
        createdAt: row.createdAt.toISOString(),
        githubInstallationId: row.installationId,
        id: row.id,
        permissions: row.permissions,
        removedAt: row.removedAt?.toISOString() ?? null,
        repositorySelection: row.repositorySelection,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
    };
}
