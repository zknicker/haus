import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearAgentSessionsTable,
    linearCredentialsTable,
    linearTeamAccessTable,
} from '../postgres/schema.ts';
import { closeLinearSessions } from './sessions.ts';

// Identity sessions follow effective identity access (specs/linear-app.md#team-scope):
// after a team access change, an open identity session whose issue's team is
// no longer in identity teams ∩ workspace teams is `orphaned`.

/**
 * Orphans open identity sessions on this workspace whose issue team left the
 * identity's effective access. Sessions record the issue identifier
 * (`DES-142`), whose prefix is the team key Linear reported with the access.
 */
export async function orphanSessionsOutsideTeamScope(
    tx: HausDatabase,
    input: { now: Date; serverId: string; workspaceId: string }
): Promise<string[]> {
    const access = await tx
        .select({
            identityId: linearCredentialsTable.identityId,
            teamKey: linearTeamAccessTable.teamKey,
        })
        .from(linearCredentialsTable)
        .leftJoin(
            linearTeamAccessTable,
            eq(linearTeamAccessTable.credentialId, linearCredentialsTable.id)
        )
        .where(eq(linearCredentialsTable.workspaceId, input.workspaceId));
    const workspaceKeys = keysFor(access, null);
    const sessions = await tx
        .select({
            id: linearAgentSessionsTable.id,
            identityId: linearAgentSessionsTable.identityId,
            issueIdentifier: linearAgentSessionsTable.issueIdentifier,
        })
        .from(linearAgentSessionsTable)
        .where(
            and(
                eq(linearAgentSessionsTable.workspaceId, input.workspaceId),
                isNotNull(linearAgentSessionsTable.identityId),
                inArray(linearAgentSessionsTable.status, ['active', 'complete'])
            )
        );
    const outside = sessions.filter((session) => {
        const key = teamKeyOf(session.issueIdentifier);
        const identityKeys = keysFor(access, session.identityId);
        // An identifier without a team prefix cannot be placed; leave the session be.
        return key !== null && !(identityKeys.has(key) && workspaceKeys.has(key));
    });
    if (outside.length === 0) {
        return [];
    }
    return await closeLinearSessions(tx, {
        now: input.now,
        serverId: input.serverId,
        status: 'orphaned',
        where: { sessionIds: outside.map((session) => session.id) },
    });
}

function keysFor(
    access: readonly { identityId: string | null; teamKey: string | null }[],
    identityId: string | null
): Set<string> {
    return new Set(
        access.flatMap((row) =>
            row.identityId === identityId && row.teamKey ? [row.teamKey.toUpperCase()] : []
        )
    );
}

/** `DES-142` → `DES`; null when the identifier has no team prefix. */
function teamKeyOf(identifier: string): string | null {
    const match = /^([A-Za-z0-9]+)-\d+$/u.exec(identifier);
    return match?.[1]?.toUpperCase() ?? null;
}
