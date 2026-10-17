import type { LinearTeam } from '@haus/api';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearCredentialsTable, linearTeamAccessTable } from '../postgres/schema.ts';

// Team scope (specs/linear-app.md#team-scope). Access is persisted per
// credential and synced at install, on every PermissionChange, and hourly.
// A failed sync keeps the last set; a set older than 24 hours is empty for writes.
// Membership rides the same rows: team settings writes need the actor to be a
// member of the team, not only to reach it.

const staleAfterMs = 24 * 60 * 60_000;

/** One team as stored: the actor reaches it, and may be a member of it. */
export interface LinearTeamMembership extends LinearTeam {
    member: boolean;
}

/** A team the actor can reach, matched by Linear id or by team key. */
export interface LinearTeamAccess {
    /** False once the last sync is older than 24 hours: writes then see no teams. */
    fresh: boolean;
    /** The reached teams the actor's app user is a member of. */
    memberTeamIds: string[];
    teams: LinearTeam[];
}

/** Replaces one credential's team set with what Linear just reported. */
export async function replaceTeamAccess(
    tx: HausDatabase,
    input: { credentialId: string; now: Date; serverId: string; teams: LinearTeamMembership[] }
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
        const values = {
            member: team.member,
            syncedAt: input.now,
            teamKey: team.key,
            teamName: team.name,
        };
        await tx
            .insert(linearTeamAccessTable)
            .values({
                ...values,
                credentialId: input.credentialId,
                serverId: input.serverId,
                teamId: team.id,
            })
            .onConflictDoUpdate({
                set: values,
                target: [linearTeamAccessTable.credentialId, linearTeamAccessTable.teamId],
            });
    }
}

/** Marks teams the actor just joined as member, without touching their sync time. */
export async function markTeamMembers(
    db: HausDatabase,
    input: { credentialId: string; teamIds: readonly string[] }
): Promise<void> {
    if (input.teamIds.length === 0) {
        return;
    }
    await db
        .update(linearTeamAccessTable)
        .set({ member: true })
        .where(
            and(
                eq(linearTeamAccessTable.credentialId, input.credentialId),
                inArray(linearTeamAccessTable.teamId, [...input.teamIds])
            )
        );
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
        memberTeamIds: rows.filter((row) => row.member).map((row) => row.teamId),
        teams: rows.map((row) => ({ id: row.teamId, key: row.teamKey, name: row.teamName })),
    };
}

/** The workspace actor's team access, or null when the workspace has no credential. */
export async function readWorkspaceTeamAccess(
    db: HausDatabase,
    workspaceId: string,
    now: Date
): Promise<LinearTeamAccess | null> {
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
    return credential ? await readTeamAccess(db, credential.id, now) : null;
}

/** The workspace actor's teams; empty for writes once stale. */
export async function workspaceWriteTeams(
    db: HausDatabase,
    workspaceId: string,
    now: Date
): Promise<LinearTeam[]> {
    const access = await readWorkspaceTeamAccess(db, workspaceId, now);
    return access ? writeTeams(access) : [];
}

/** Teams usable for writes: none once the set is stale. */
export function writeTeams(access: LinearTeamAccess): LinearTeam[] {
    return access.fresh ? access.teams : [];
}

/** Member teams usable for membership writes: none once the set is stale. */
export function writeMemberTeamIds(access: LinearTeamAccess): string[] {
    return access.fresh ? access.memberTeamIds : [];
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
