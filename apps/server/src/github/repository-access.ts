import type { GithubRepository } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    GithubApiError,
    type GithubApiTransport,
    githubNextPage,
    githubRequest,
} from './github-api.ts';
import { GithubSignInRequiredError } from './github-errors.ts';
import { syncGithubTriggerProblems } from './trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from './trigger-problems.ts';
import { withGithubUserToken } from './user-token.ts';

// The accessible repository cache (specs/github-app-connection.md#repository-access):
// the repositories the connection's GitHub user can reach inside one
// installation. A Trigger only ever sees these. A transient failure keeps the
// cache; staleness past 24 hours is `sign_in_required` (trigger-problem-sync.ts).

export interface GithubAccessDependencies {
    clock: { now(): Date };
    db: HausDatabase;
    transport?: GithubApiTransport;
}

export type GithubAccessRefresh =
    | {
          entered: GithubTriggerProblemEntered[];
          kind: 'refreshed';
          repositories: GithubRepository[];
      }
    | { kind: 'retry' }
    | { kind: 'sign_in_required' };

const repositorySchema = z.object({
    full_name: z.string().min(1),
    id: z.number().int().positive(),
    private: z.boolean(),
});

/** Every repository the user token reaches in the installation; a 404 means none. */
export async function fetchGithubInstallationRepositories(
    transport: GithubApiTransport | undefined,
    token: string,
    githubInstallationId: number
): Promise<GithubRepository[]> {
    const repositories: GithubRepository[] = [];
    let path: string | null = `/user/installations/${githubInstallationId}/repositories`;
    let query: Record<string, number> | undefined = { per_page: 100 };
    try {
        while (path) {
            const response = await githubRequest(
                { credential: { kind: 'user', token }, path, query },
                transport
            );
            const page = z
                .object({ repositories: z.array(repositorySchema) })
                .parse(response.body).repositories;
            repositories.push(
                ...page.map((repository) => ({
                    fullName: repository.full_name,
                    id: repository.id,
                    private: repository.private,
                }))
            );
            path = githubNextPage(response.headers);
            query = undefined;
        }
    } catch (cause) {
        if (cause instanceof GithubApiError && cause.failure === 'not_found') {
            return [];
        }
        throw cause;
    }
    return repositories;
}

/**
 * Re-reads the installation's accessible repositories with the connection's
 * user token, stores them, and re-derives dependent Trigger problems in one
 * transaction. Notices the caller should wake for come back as `entered`.
 */
export async function refreshGithubRepositoryAccess(
    dependencies: GithubAccessDependencies,
    installation: { id: string; serverId: string }
): Promise<GithubAccessRefresh> {
    const row = await readInstallation(dependencies.db, installation);
    if (!(row?.connectionId && row.status !== 'removed')) {
        return { kind: 'sign_in_required' };
    }
    let repositories: GithubRepository[];
    try {
        repositories = await withGithubUserToken(
            dependencies,
            { connectionId: row.connectionId, serverId: row.serverId },
            (token) =>
                fetchGithubInstallationRepositories(
                    dependencies.transport,
                    token,
                    row.installationId
                )
        );
    } catch (cause) {
        if (cause instanceof GithubSignInRequiredError) {
            return { kind: 'sign_in_required' };
        }
        if (cause instanceof GithubApiError) {
            return { kind: 'retry' };
        }
        throw cause;
    }
    const now = dependencies.clock.now();
    const entered = await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, row.serverId);
        const [updated] = await tx
            .update(githubInstallationsTable)
            .set({
                accessibleRepositoryIds: repositories.map((repository) => repository.id),
                accessSyncedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(githubInstallationsTable.serverId, row.serverId),
                    eq(githubInstallationsTable.id, row.id)
                )
            )
            .returning();
        return updated && updated.status !== 'removed'
            ? await syncGithubTriggerProblems(tx, { installation: updated, now })
            : [];
    });
    return { entered, kind: 'refreshed', repositories };
}

/**
 * The repository picker reads GitHub live (the cache holds ids, not names)
 * and refreshes the cache on the way. `query` filters by name, ignoring case.
 */
export async function readGithubPickerRepositories(
    dependencies: GithubAccessDependencies,
    installation: { id: string; serverId: string },
    query?: string
): Promise<GithubRepository[]> {
    const refreshed = await refreshGithubRepositoryAccess(dependencies, installation);
    if (refreshed.kind === 'sign_in_required') {
        throw new GithubSignInRequiredError();
    }
    if (refreshed.kind === 'retry') {
        throw new GithubApiError('retryable', null, 'GitHub did not list repositories.');
    }
    const needle = query?.toLowerCase();
    return refreshed.repositories
        .filter((repository) => !needle || repository.fullName.toLowerCase().includes(needle))
        .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

async function readInstallation(db: HausDatabase, input: { id: string; serverId: string }) {
    const [row] = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                eq(githubInstallationsTable.id, input.id)
            )
        )
        .limit(1);
    return row ?? null;
}
