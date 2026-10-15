import type { LinearTeam } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearCredentialsTable, linearWorkspacesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { LinearCredential } from './credentials.ts';
import { labelLifecycle } from './label-lifecycle.ts';
import { readLinearTeams } from './linear-api.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';
import { sweepLinearAttempts } from './oauth-attempts.ts';
import { replaceTeamAccess } from './team-access.ts';

// Team scope (specs/linear-app.md#team-scope): access is synced at install, on
// every PermissionChange, and hourly. A failed sync keeps the last set; the
// 24-hour staleness rule in team-access.ts covers a Linear that stays down.

const sweepIntervalMs = 60 * 60_000;

export interface LinearTeamSyncDependencies {
    /** A valid access token per credential (the refresher); throws sign-in required otherwise. */
    accessToken(credentialId: string): Promise<string>;
    clock: { now(): Date };
    db: HausDatabase;
    fetch: typeof fetch;
}

export interface LinearTeamSyncOutcome {
    failed: number;
    synced: number;
}

/**
 * Replaces one credential's team access with what Linear reported, inside the
 * caller's Server-locked transaction. The workspace actor's newly accessible
 * teams get pending Agent label rows.
 */
export async function applyLinearTeamAccess(
    tx: HausDatabase,
    credential: Pick<LinearCredential, 'id' | 'identityId' | 'serverId' | 'workspaceId'>,
    teams: LinearTeam[],
    now: Date
): Promise<void> {
    await replaceTeamAccess(tx, {
        credentialId: credential.id,
        now,
        serverId: credential.serverId,
        teams,
    });
    if (!credential.identityId) {
        await labelLifecycle.teamsChanged(tx, {
            serverId: credential.serverId,
            workspaceId: credential.workspaceId,
        });
    }
}

/**
 * Re-reads the teams of every `valid` credential on an `active` workspace.
 * One credential's failure never stops the rest; it keeps its last set.
 */
export async function syncLinearTeams(
    dependencies: LinearTeamSyncDependencies
): Promise<LinearTeamSyncOutcome> {
    const { db } = dependencies;
    const credentials = await db
        .select({
            id: linearCredentialsTable.id,
            identityId: linearCredentialsTable.identityId,
            serverId: linearCredentialsTable.serverId,
            workspaceId: linearCredentialsTable.workspaceId,
        })
        .from(linearCredentialsTable)
        .innerJoin(
            linearWorkspacesTable,
            eq(linearWorkspacesTable.id, linearCredentialsTable.workspaceId)
        )
        .where(
            and(
                eq(linearCredentialsTable.state, 'valid'),
                eq(linearWorkspacesTable.status, 'active')
            )
        );
    const outcome: LinearTeamSyncOutcome = { failed: 0, synced: 0 };
    for (const credential of credentials) {
        try {
            const token = await dependencies.accessToken(credential.id);
            const teams = await readLinearTeams(dependencies.fetch, token);
            const applied = await db.transaction(async (tx) => {
                await lockServerRow(tx, credential.serverId);
                if (!(await stillValid(tx, credential.id))) {
                    return false;
                }
                await applyLinearTeamAccess(tx, credential, teams, dependencies.clock.now());
                return true;
            });
            outcome.synced += applied ? 1 : 0;
        } catch (error) {
            // A credential that left `valid` mid-sweep is not a failure.
            if (!(error instanceof LinearSignInRequiredError)) {
                outcome.failed += 1;
                console.error(
                    '[haus] Linear team sync failed for a credential',
                    error instanceof Error ? error.name : 'unknown error'
                );
            }
        }
    }
    return outcome;
}

/**
 * The hourly Linear sweep: team access for every live actor, then expired
 * OAuth attempts (specs/linear-app.md#binding-and-authority).
 */
export function startLinearSweep(
    dependencies: LinearTeamSyncDependencies,
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'Linear sweep',
        run: async () => {
            await syncLinearTeams(dependencies);
            await sweepLinearAttempts(dependencies.db, dependencies.clock.now());
        },
        timers,
    });
}

async function stillValid(tx: HausDatabase, credentialId: string): Promise<boolean> {
    const [row] = await tx
        .select({ state: linearCredentialsTable.state })
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.id, credentialId))
        .limit(1);
    return row?.state === 'valid';
}
