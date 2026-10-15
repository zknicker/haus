import type { LinearTeam } from '@haus/api';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearCredentialsTable, linearTeamAccessTable } from '../postgres/schema.ts';

// Team scope (specs/linear-app.md#team-scope). Access is persisted per
// credential and synced at install, on every PermissionChange, and hourly.
// A failed sync keeps the last set; a set older than 24 hours is empty for writes.

const staleAfterMs = 24 * 60 * 60_000;

/** A team the actor can reach, matched by Linear id or by team key. */
export interface LinearTeamAccess {
    /** False once the last sync is older than 24 hours: writes then see no teams. */
    fresh: boolean;
    teams: LinearTeam[];
}

/** Replaces one credential's team set with what Linear just reported. */
export async function replaceTeamAccess(
    tx: HausDatabase,
    input: { credentialId: string; now: Date; serverId: string; teams: LinearTeam[] }
): Promise<void> {
    const ids = input.teams.map((team) => team.id);
    await tx
        .delete(linearTeamAccessTable)
        .where(
            and(
                eq(linearTeamAccessTable.credentialId, input.credentialId),
                ids.length > 0 ? notInArray(linearTeamAccessTable.teamId, ids) : undefined
            )
        );
    for (const team of input.teams) {
        await tx
            .insert(linearTeamAccessTable)
            .values({
                credentialId: input.credentialId,
                serverId: input.serverId,
                syncedAt: input.now,
                teamId: team.id,
                teamKey: team.key,
                teamName: team.name,
            })
            .onConflictDoUpdate({
                set: { syncedAt: input.now, teamKey: team.key, teamName: team.name },
                target: [linearTeamAccessTable.credentialId, linearTeamAccessTable.teamId],
            });
    }
}

/** One credential's teams, as of its last sync. */
export async function readTeamAccess(
    db: HausDatabase,
    credentialId: string,
    now: Date
): Promise<LinearTeamAccess> {
    const rows = await db
        .select()
        .from(linearTeamAccessTable)
        .where(eq(linearTeamAccessTable.credentialId, credentialId));
    const syncedAt = Math.min(...rows.map((row) => row.syncedAt.getTime()));
    return {
        fresh: rows.length === 0 || now.getTime() - syncedAt <= staleAfterMs,
        teams: rows.map((row) => ({ id: row.teamId, key: row.teamKey, name: row.teamName })),
    };
}

/** The workspace actor's teams; empty for writes once stale. */
export async function workspaceWriteTeams(
    db: HausDatabase,
    workspaceId: string,
    now: Date
): Promise<LinearTeam[]> {
    const [credential] = await db
        .select({ id: linearCredentialsTable.id })
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, workspaceId),
                isNull(linearCredentialsTable.identityId)
            )
        )
        .limit(1);
    return credential ? writeTeams(await readTeamAccess(db, credential.id, now)) : [];
}

/** Teams usable for writes: none once the set is stale. */
export function writeTeams(access: LinearTeamAccess): LinearTeam[] {
    return access.fresh ? access.teams : [];
}

/** Effective identity access: identity teams ∩ workspace teams. */
export function effectiveIdentityTeams(
    identityTeams: readonly LinearTeam[],
    workspaceTeams: readonly LinearTeam[]
): LinearTeam[] {
    const workspace = new Set(workspaceTeams.map((team) => team.id));
    return identityTeams.filter((team) => workspace.has(team.id));
}

/** Resolves a team reference (Linear id or key) against a team set. */
export function findTeam(teams: readonly LinearTeam[], reference: string): LinearTeam | undefined {
    const key = reference.toUpperCase();
    return teams.find((team) => team.id === reference || team.key.toUpperCase() === key);
}
