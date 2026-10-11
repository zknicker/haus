import type { GithubInstallation, GithubInstallCandidate, GithubRepository } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { GithubApiError } from './github-api.ts';
import type { GithubApp } from './github-app.ts';
import { GithubRefusedError } from './github-errors.ts';
import {
    requireGithubAdmin,
    requireGithubConnection,
    shapeGithubInstallation,
} from './installation-access.ts';
import {
    type GithubInstallationFacts,
    listGithubUserInstallations,
    readGithubInstallationFacts,
} from './installation-facts.ts';
import { ownsGithubAccount, readGithubUser } from './owner-authority.ts';
import { fetchGithubInstallationRepositories } from './repository-access.ts';
import { syncGithubTriggerProblems } from './trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from './trigger-problems.ts';
import { withGithubUserToken } from './user-token.ts';

// Installation binding (specs/github-app-connection.md#binding). Both sides
// prove authority: a Server Owner or Admin on the Haus side, and on GitHub the
// connection user's ownership of the installation's account. Account facts
// come from the App JWT read, never from a redirect.

export interface GithubBindingDependencies {
    app: GithubApp;
    clock: { now(): Date };
    db: HausDatabase;
}

export interface GithubBindInput {
    connectionId: string;
    githubInstallationId: number;
    serverId: string;
    /** The Haus user binding; must be a Server Owner or Admin. */
    userId: string;
}

export async function bindGithubInstallation(
    dependencies: GithubBindingDependencies,
    input: GithubBindInput
): Promise<{ entered: GithubTriggerProblemEntered[]; installation: GithubInstallation }> {
    const { app, db } = dependencies;
    await requireGithubAdmin(db, { id: input.userId }, input.serverId);
    await requireGithubConnection(db, input);
    const facts = await readFacts(app, input.githubInstallationId);
    const proof = await withGithubUserToken(
        { db, transport: app.transport },
        input,
        async (token) => {
            const user = await readGithubUser(app.transport, token);
            if (!(await ownsGithubAccount(app.transport, token, user, facts.account))) {
                return null;
            }
            return await fetchGithubInstallationRepositories(
                app.transport,
                token,
                facts.githubInstallationId
            );
        }
    );
    if (!proof) {
        throw new GithubRefusedError(
            'FORBIDDEN',
            'github_owner_required',
            facts.account.type === 'Organization'
                ? `Only an admin of the ${facts.account.login} organization can bind its installation.`
                : `Only ${facts.account.login} can bind their own installation.`
        );
    }
    try {
        return await db.transaction((tx) => storeBinding(tx, dependencies, input, facts, proof));
    } catch (cause) {
        if (violatesConstraint(cause, 'github_installations_live_installation_key')) {
            throw boundElsewhere();
        }
        throw cause;
    }
}

/**
 * Unbound installations the signed-in GitHub user owns, offered by "Add
 * existing installation". Each is display-only; binding reruns every check.
 */
export async function listGithubInstallCandidates(
    dependencies: GithubBindingDependencies,
    input: Omit<GithubBindInput, 'githubInstallationId'>
): Promise<GithubInstallCandidate[]> {
    const { app, db } = dependencies;
    await requireGithubAdmin(db, { id: input.userId }, input.serverId);
    await requireGithubConnection(db, input);
    const owned = await withGithubUserToken(
        { db, transport: app.transport },
        input,
        async (token) => {
            const user = await readGithubUser(app.transport, token);
            const visible = await listGithubUserInstallations(app.transport, token);
            const checks = await Promise.all(
                visible.map(async (facts) =>
                    (await ownsGithubAccount(app.transport, token, user, facts.account))
                        ? facts
                        : null
                )
            );
            return checks.filter((facts): facts is GithubInstallationFacts => facts !== null);
        }
    );
    const bound = new Set(
        (
            await db
                .select({ installationId: githubInstallationsTable.installationId })
                .from(githubInstallationsTable)
                .where(ne(githubInstallationsTable.status, 'removed'))
        ).map((row) => row.installationId)
    );
    return owned
        .filter((facts) => !bound.has(facts.githubInstallationId))
        .map((facts) => ({
            account: facts.account,
            githubInstallationId: facts.githubInstallationId,
            repositorySelection: facts.repositorySelection,
        }));
}

async function storeBinding(
    tx: HausDatabase,
    dependencies: GithubBindingDependencies,
    input: GithubBindInput,
    facts: GithubInstallationFacts,
    repositories: GithubRepository[]
) {
    await lockServerRow(tx, input.serverId);
    const now = dependencies.clock.now();
    const [live] = await tx
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.installationId, facts.githubInstallationId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .for('update');
    if (live && (live.serverId !== input.serverId || live.connectionId !== input.connectionId)) {
        // Never names the other Server.
        throw boundElsewhere();
    }
    const values = {
        accessibleRepositoryIds: repositories.map((repository) => repository.id),
        accessSyncedAt: now,
        accountId: facts.account.id,
        accountLogin: facts.account.login,
        accountType: facts.account.type,
        events: facts.events,
        permissions: facts.permissions,
        repositorySelection: facts.repositorySelection,
        status: facts.suspended ? ('suspended' as const) : ('active' as const),
        syncedAt: now,
        updatedAt: now,
    };
    const [row] = live
        ? await tx
              .update(githubInstallationsTable)
              .set(values)
              .where(eq(githubInstallationsTable.id, live.id))
              .returning()
        : await tx
              .insert(githubInstallationsTable)
              .values({
                  ...values,
                  boundByUserId: input.userId,
                  connectionId: input.connectionId,
                  createdAt: now,
                  id: createOpaqueId('ghi'),
                  installationId: facts.githubInstallationId,
                  serverId: input.serverId,
              })
              .returning();
    if (!row) {
        throw new Error('The GitHub installation was not saved.');
    }
    const entered = await syncGithubTriggerProblems(tx, { installation: row, now });
    return { entered, installation: shapeGithubInstallation(row) };
}

async function readFacts(app: GithubApp, githubInstallationId: number) {
    try {
        return await readGithubInstallationFacts(app, githubInstallationId);
    } catch (cause) {
        if (cause instanceof GithubApiError && cause.failure === 'not_found') {
            throw new GithubRefusedError(
                'NOT_FOUND',
                'github_installation_not_found',
                'GitHub has no installation of the Haus App with that id.'
            );
        }
        throw cause;
    }
}

function boundElsewhere() {
    return new GithubRefusedError(
        'CONFLICT',
        'github_installation_already_bound',
        'This GitHub installation is already bound to another Haus Server or connection.'
    );
}
