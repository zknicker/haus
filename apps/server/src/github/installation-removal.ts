import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { requireAdmin } from '../server-mcp/connection-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { GithubRefusedError } from './github-errors.ts';
import { type GithubTriggerProblemEntered, markGithubTriggersProblem } from './trigger-problems.ts';

// Removal and deletion (specs/github-app-connection.md#removal-and-deletion).
// Unbinding, deleting the GitHub connection, and reconciliation to `removed`
// share one shape: every dependent armed Trigger enters
// `installation_removed` with one notice, then the installation becomes a
// tombstone with no connection. The caller commits, then wakes the owners.

/**
 * Tombstones the selected live installations inside the caller's transaction,
 * which already holds the Server row lock.
 */
export async function tombstoneGithubInstallations(
    tx: HausDatabase,
    input: {
        now: Date;
        scope: { connectionId: string } | { installationRowId: string };
        serverId: string;
    }
): Promise<GithubTriggerProblemEntered[]> {
    const rows = await tx
        .select({ id: githubInstallationsTable.id })
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                'connectionId' in input.scope
                    ? eq(githubInstallationsTable.connectionId, input.scope.connectionId)
                    : eq(githubInstallationsTable.id, input.scope.installationRowId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .for('update');
    const entered: GithubTriggerProblemEntered[] = [];
    for (const row of rows) {
        const marked = await markGithubTriggersProblem(tx, {
            now: input.now,
            problem: 'installation_removed',
            scope: { installationRowId: row.id },
            serverId: input.serverId,
        });
        entered.push(...marked.entered);
        await tx
            .update(githubInstallationsTable)
            .set({
                connectionId: null,
                removedAt: input.now,
                status: 'removed',
                updatedAt: input.now,
            })
            .where(
                and(
                    eq(githubInstallationsTable.serverId, input.serverId),
                    eq(githubInstallationsTable.id, row.id)
                )
            );
    }
    return entered;
}

/** `github.unbindInstallation`: an Owner or Admin removes one installation from Haus. */
export async function unbindGithubInstallation(
    db: HausDatabase,
    member: HausUser | null,
    input: { installationId: string; now: Date; serverId: string }
): Promise<GithubTriggerProblemEntered[]> {
    await requireAdmin(db, member, input.serverId, 'remove a GitHub installation');
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({ status: githubInstallationsTable.status })
            .from(githubInstallationsTable)
            .where(
                and(
                    eq(githubInstallationsTable.serverId, input.serverId),
                    eq(githubInstallationsTable.id, input.installationId)
                )
            )
            .limit(1);
        if (!row || row.status === 'removed') {
            throw new GithubRefusedError(
                'NOT_FOUND',
                'github_installation_not_found',
                'That GitHub installation is not bound to this Server.'
            );
        }
        return await tombstoneGithubInstallations(tx, {
            now: input.now,
            scope: { installationRowId: input.installationId },
            serverId: input.serverId,
        });
    });
}
