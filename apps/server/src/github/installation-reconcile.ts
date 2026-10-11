import type { GithubInstallationStatus } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { GithubAppJwtSigner } from './app-auth.ts';
import { GithubApiError, type GithubApiTransport } from './github-api.ts';
import { type GithubInstallationFacts, readGithubInstallationFacts } from './installation-facts.ts';
import { tombstoneGithubInstallations } from './installation-removal.ts';
import { refreshGithubRepositoryAccess } from './repository-access.ts';
import { syncGithubTriggerProblems } from './trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from './trigger-problems.ts';

export interface GithubReconcileDependencies {
    app: GithubAppJwtSigner;
    clock: { now(): Date };
    db: HausDatabase;
    transport?: GithubApiTransport;
}

/**
 * What reconciling one installation found. `unbound` means no live Haus row
 * holds that GitHub installation; `retry` means GitHub could not answer (429,
 * 5xx, rate-limited 403, network) and nothing changed. `entered` lists the
 * Triggers that newly entered a problem; their notices are already queued and
 * the caller may wake the owners after this returns.
 */
export type GithubReconcileOutcome =
    | {
          entered: GithubTriggerProblemEntered[];
          installationRowId: string;
          kind: 'reconciled';
          serverId: string;
          status: GithubInstallationStatus;
      }
    | { kind: 'retry' }
    | { kind: 'unbound' };

/**
 * Fetches `GET /app/installations/{id}` with the App JWT and derives the
 * installation's state from the answer, committing every status change with
 * its Trigger problems in one transaction
 * (specs/github-app-connection.md#lifecycle-reconciliation). Lifecycle
 * deliveries and the hourly sweep call this; neither is trusted on its own.
 */
export async function reconcileGithubInstallation(
    dependencies: GithubReconcileDependencies,
    input: { githubInstallationId: number }
): Promise<GithubReconcileOutcome> {
    const live = await readLiveRow(dependencies.db, input.githubInstallationId);
    if (!live) {
        return { kind: 'unbound' };
    }
    let facts: GithubInstallationFacts | null;
    try {
        facts = await readGithubInstallationFacts(
            { signer: dependencies.app, transport: dependencies.transport },
            input.githubInstallationId
        );
    } catch (cause) {
        if (!(cause instanceof GithubApiError)) {
            throw cause;
        }
        if (cause.failure !== 'not_found') {
            // Retryable, or a refusal (a bad JWT) that says nothing about the installation.
            return { kind: 'retry' };
        }
        facts = null;
    }
    if (!facts) {
        return await markRemoved(dependencies, live);
    }
    const status: GithubInstallationStatus = facts.suspended ? 'suspended' : 'active';
    const applied = await applyFacts(dependencies, live, facts, status);
    if (status !== 'active') {
        return applied;
    }
    const access = await refreshGithubRepositoryAccess(dependencies, live);
    return access.kind === 'refreshed'
        ? { ...applied, entered: [...applied.entered, ...access.entered] }
        : applied;
}

type InstallationRow = typeof githubInstallationsTable.$inferSelect;

async function markRemoved(
    dependencies: GithubReconcileDependencies,
    live: InstallationRow
): Promise<GithubReconcileOutcome> {
    const entered = await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, live.serverId);
        return await tombstoneGithubInstallations(tx, {
            now: dependencies.clock.now(),
            scope: { installationRowId: live.id },
            serverId: live.serverId,
        });
    });
    return {
        entered,
        installationRowId: live.id,
        kind: 'reconciled',
        serverId: live.serverId,
        status: 'removed',
    };
}

async function applyFacts(
    dependencies: GithubReconcileDependencies,
    live: InstallationRow,
    facts: GithubInstallationFacts,
    status: GithubInstallationStatus
): Promise<Extract<GithubReconcileOutcome, { kind: 'reconciled' }>> {
    const now = dependencies.clock.now();
    const entered = await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, live.serverId);
        const [row] = await tx
            .update(githubInstallationsTable)
            .set({
                accountLogin: facts.account.login,
                events: facts.events,
                permissions: facts.permissions,
                repositorySelection: facts.repositorySelection,
                status,
                syncedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(githubInstallationsTable.serverId, live.serverId),
                    eq(githubInstallationsTable.id, live.id),
                    ne(githubInstallationsTable.status, 'removed')
                )
            )
            .returning();
        return row ? await syncGithubTriggerProblems(tx, { installation: row, now }) : [];
    });
    return {
        entered,
        installationRowId: live.id,
        kind: 'reconciled',
        serverId: live.serverId,
        status,
    };
}

async function readLiveRow(db: HausDatabase, githubInstallationId: number) {
    const [row] = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.installationId, githubInstallationId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .limit(1);
    return row ?? null;
}
