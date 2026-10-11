import { and, eq, ne } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { GithubApp } from './github-app.ts';
import { reconcileGithubInstallation } from './installation-reconcile.ts';
import { refreshGithubRepositoryAccess } from './repository-access.ts';
import { syncGithubTriggerProblems } from './trigger-problem-sync.ts';
import { type GithubTriggerProblemEntered, problemWakes } from './trigger-problems.ts';

const sweepIntervalMs = 60 * 60_000;

export interface GithubInstallationSweepDependencies {
    app: GithubApp;
    clock: { now(): Date };
    db: HausDatabase;
    /** Wakes owners whose Triggers entered a problem, after each commit. */
    wake?(wakes: { agentId: string; serverId: string }[]): void;
}

/**
 * The hourly lifecycle sweep: reconciles every live installation against
 * GitHub and refreshes its repository access. When GitHub cannot answer, the
 * stored state still re-derives Trigger problems, so an access cache that
 * aged past 24 hours becomes `sign_in_required` even while GitHub is down.
 */
export async function sweepGithubInstallations(
    dependencies: GithubInstallationSweepDependencies
): Promise<GithubTriggerProblemEntered[]> {
    const { app, db } = dependencies;
    const live = await db
        .select({
            id: githubInstallationsTable.id,
            installationId: githubInstallationsTable.installationId,
            serverId: githubInstallationsTable.serverId,
        })
        .from(githubInstallationsTable)
        .where(ne(githubInstallationsTable.status, 'removed'));
    const entered: GithubTriggerProblemEntered[] = [];
    for (const installation of live) {
        const outcome = await reconcileGithubInstallation(
            { app: app.signer, clock: dependencies.clock, db, transport: app.transport },
            { githubInstallationId: installation.installationId }
        );
        let found: GithubTriggerProblemEntered[] = [];
        if (outcome.kind === 'reconciled') {
            found = outcome.entered;
        } else if (outcome.kind === 'retry') {
            found = await resyncFromStoredState(dependencies, installation);
        }
        if (found.length > 0) {
            dependencies.wake?.(problemWakes(installation.serverId, found));
        }
        entered.push(...found);
    }
    return entered;
}

/** Runs the sweep at boot and hourly after that. */
export function startGithubInstallationSweep(
    dependencies: GithubInstallationSweepDependencies,
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'GitHub installation sweep',
        run: () => sweepGithubInstallations(dependencies),
        timers,
    });
}

/**
 * After the GitHub connection signs in, refresh repository access for its
 * installations so Triggers waiting on `sign_in_required` resume at once.
 * Null without a configured App.
 */
export function githubSignedInHook(
    app: GithubApp | null,
    db: HausDatabase,
    wake?: GithubInstallationSweepDependencies['wake']
): ((connection: { id: string; preset: string | null; serverId: string }) => Promise<void>) | null {
    if (!app) {
        return null;
    }
    const dependencies = { app, clock: { now: () => new Date() }, db };
    return async (connection) => {
        if (connection.preset !== 'github') {
            return;
        }
        const live = await dependencies.db
            .select({
                id: githubInstallationsTable.id,
                serverId: githubInstallationsTable.serverId,
            })
            .from(githubInstallationsTable)
            .where(
                and(
                    eq(githubInstallationsTable.serverId, connection.serverId),
                    eq(githubInstallationsTable.connectionId, connection.id),
                    ne(githubInstallationsTable.status, 'removed')
                )
            );
        for (const installation of live) {
            const access = await refreshGithubRepositoryAccess(
                {
                    clock: dependencies.clock,
                    db: dependencies.db,
                    transport: dependencies.app.transport,
                },
                installation
            );
            if (access.kind !== 'retry' && access.entered.length > 0) {
                wake?.(problemWakes(installation.serverId, access.entered));
            }
        }
    };
}

async function resyncFromStoredState(
    dependencies: GithubInstallationSweepDependencies,
    installation: { id: string; serverId: string }
) {
    const now = dependencies.clock.now();
    return await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, installation.serverId);
        const [row] = await tx
            .select()
            .from(githubInstallationsTable)
            .where(
                and(
                    eq(githubInstallationsTable.serverId, installation.serverId),
                    eq(githubInstallationsTable.id, installation.id)
                )
            )
            .limit(1);
        return row && row.status !== 'removed'
            ? await syncGithubTriggerProblems(tx, { installation: row, now })
            : [];
    });
}
