import {
    type GithubRepository,
    type GithubTriggerConfigInput,
    githubTriggerEventPermission,
    githubTriggerInstallationCap,
} from '@haus/api';
import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { githubAccessCacheMaxAgeMs } from '../github/delivery-routing.ts';
import { GithubApiError, type GithubApiTransport } from '../github/github-api.ts';
import { GithubRefusedError, GithubSignInRequiredError } from '../github/github-errors.ts';
import { fetchGithubInstallationRepositories } from '../github/repository-access.ts';
import { withGithubUserToken } from '../github/user-token.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    githubInstallationsTable,
    githubTriggerConfigsTable,
    mcpConnectionsTable,
    triggersTable,
} from '../postgres/schema.ts';
import { TriggerRequestRefusedError } from './trigger-model.ts';

// Authoring checks for a `github` Trigger (specs/github-triggers.md#authoring).
// Each refusal is a BAD_REQUEST whose message names the fix.

type Installation = typeof githubInstallationsTable.$inferSelect;

/** The stored half of a validated `github` configuration. */
export type GithubTriggerConfigRow = Omit<
    typeof githubTriggerConfigsTable.$inferInsert,
    'serverId' | 'triggerId'
>;

export interface GithubAuthoringDependencies {
    db: HausDatabase;
    /** GitHub's REST transport; tests point it at a fake. */
    transport: GithubApiTransport;
}

/**
 * Lists what the connection's GitHub user can reach in the installation, so
 * selected repository names resolve to GitHub's stable ids. Runs before the
 * authoring transaction: no GitHub call ever holds the Server lock. Scope
 * `installation` needs no lookup.
 */
export async function lookupGithubRepositories(
    dependencies: GithubAuthoringDependencies,
    input: { config: GithubTriggerConfigInput; serverId: string }
): Promise<GithubRepository[] | null> {
    if (input.config.repositories.scope === 'installation') {
        return null;
    }
    const installation = await requireActiveInstallation(dependencies.db, {
        installationRowId: input.config.installationId,
        serverId: input.serverId,
    });
    const connectionId = requireConnectionId(installation);
    try {
        return await withGithubUserToken(
            dependencies,
            { connectionId, serverId: input.serverId },
            (token) =>
                fetchGithubInstallationRepositories(
                    dependencies.transport,
                    token,
                    installation.installationId
                )
        );
    } catch (cause) {
        if (cause instanceof GithubSignInRequiredError) {
            throw signInRequired();
        }
        if (cause instanceof GithubRefusedError) {
            throw new TriggerRequestRefusedError('github_access_required', cause.message);
        }
        if (cause instanceof GithubApiError) {
            throw new TriggerRequestRefusedError(
                'github_repositories_unavailable',
                'GitHub did not list the installation repositories just now. Try again shortly.'
            );
        }
        throw cause;
    }
}

/**
 * Validates a configuration inside the authoring transaction, behind the
 * Server lock: an active installation, the owner's grant on its connection, a
 * fresh access cache, every permission its events need, room under the cap,
 * and every selected repository inside the access cache.
 */
export async function validateGithubTriggerConfig(
    tx: HausDatabase,
    input: {
        config: GithubTriggerConfigInput;
        /** Excluded from the cap count when an existing Trigger is edited. */
        editingTriggerId: string | null;
        now: Date;
        ownerAgentId: string;
        repositories: GithubRepository[] | null;
        serverId: string;
    }
): Promise<GithubTriggerConfigRow> {
    const installation = await requireActiveInstallation(tx, {
        installationRowId: input.config.installationId,
        serverId: input.serverId,
    });
    await requireAccess(tx, installation, input);
    requirePermissions(installation, input.config);
    await requireCapacity(tx, installation, input.editingTriggerId);
    const base = {
        events: input.config.events,
        installationRowId: installation.id,
        problem: null,
        problemSince: null,
    };
    if (input.config.repositories.scope === 'installation') {
        return { ...base, repositoryIds: [], repositoryNames: [], repositoryScope: 'installation' };
    }
    const byName = new Map(
        (input.repositories ?? []).map((repository) => [
            repository.fullName.toLowerCase(),
            repository,
        ])
    );
    const selected = input.config.repositories.names.map((name) => ({
        name,
        repository: byName.get(name.toLowerCase()) ?? null,
    }));
    const missing = selected.filter(
        ({ repository }) =>
            !(repository && installation.accessibleRepositoryIds.includes(repository.id))
    );
    if (missing.length > 0) {
        throw new TriggerRequestRefusedError(
            'github_repositories_unavailable',
            `${missing.map(({ name }) => name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not reachable through this installation. Add ${missing.length === 1 ? 'it' : 'them'} to the installation on GitHub, or pick from the repositories it lists.`
        );
    }
    const repositories = selected.flatMap(({ repository }) => (repository ? [repository] : []));
    return {
        ...base,
        repositoryIds: repositories.map((repository) => repository.id),
        repositoryNames: repositories.map((repository) => repository.fullName),
        repositoryScope: 'repositories',
    };
}

async function requireActiveInstallation(
    db: Pick<HausDatabase, 'select'>,
    input: { installationRowId: string; serverId: string }
): Promise<Installation> {
    const [installation] = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                eq(githubInstallationsTable.id, input.installationRowId)
            )
        )
        .limit(1);
    if (!installation || installation.status === 'removed') {
        throw new TriggerRequestRefusedError(
            'github_installation_unavailable',
            'That GitHub installation is not bound to this Server. Install the Haus App on GitHub, then add the installation to the GitHub connection.'
        );
    }
    if (installation.status === 'suspended') {
        throw new TriggerRequestRefusedError(
            'github_installation_unavailable',
            `The Haus App is suspended on ${installation.accountLogin}. An owner of that account must unsuspend it on GitHub.`
        );
    }
    return installation;
}

function requireConnectionId(installation: Installation): string {
    if (!installation.connectionId) {
        throw signInRequired();
    }
    return installation.connectionId;
}

async function requireAccess(
    tx: HausDatabase,
    installation: Installation,
    input: { now: Date; ownerAgentId: string; serverId: string }
): Promise<void> {
    const connectionId = requireConnectionId(installation);
    const [connection] = await tx
        .select({ connected: mcpConnectionsTable.connected })
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, input.serverId),
                eq(mcpConnectionsTable.id, connectionId)
            )
        )
        .limit(1);
    const synced = installation.accessSyncedAt;
    if (
        !(connection?.connected && synced) ||
        input.now.getTime() - synced.getTime() > githubAccessCacheMaxAgeMs
    ) {
        throw signInRequired();
    }
    const [grant] = await tx
        .select({ agentId: agentMcpConnectionGrantsTable.agentId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, connectionId),
                eq(agentMcpConnectionGrantsTable.agentId, input.ownerAgentId)
            )
        )
        .limit(1);
    if (!grant) {
        throw new TriggerRequestRefusedError(
            'github_access_required',
            'The Agent has no access to the GitHub connection. A Server Owner or Admin can grant it under the GitHub connection’s Agent Access.'
        );
    }
}

function requirePermissions(installation: Installation, config: GithubTriggerConfigInput) {
    const missing = [
        ...new Set(
            config.events
                .map((entry) => githubTriggerEventPermission[entry.event])
                .filter((permission) => !installation.permissions[permission])
        ),
    ];
    if (missing.length > 0) {
        throw new TriggerRequestRefusedError(
            'github_permissions_missing',
            `The installation on ${installation.accountLogin} has not granted ${missing.join(', ')}. An owner must accept the Haus App’s permission update on GitHub.`
        );
    }
}

async function requireCapacity(
    tx: HausDatabase,
    installation: Installation,
    editingTriggerId: string | null
): Promise<void> {
    const [row] = await tx
        .select({ total: count() })
        .from(githubTriggerConfigsTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, githubTriggerConfigsTable.serverId),
                eq(triggersTable.id, githubTriggerConfigsTable.triggerId)
            )
        )
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, installation.serverId),
                eq(githubTriggerConfigsTable.installationRowId, installation.id),
                isNull(triggersTable.deletedAt),
                editingTriggerId ? ne(triggersTable.id, editingTriggerId) : undefined
            )
        );
    if ((row?.total ?? 0) >= githubTriggerInstallationCap) {
        throw new TriggerRequestRefusedError(
            'github_trigger_limit',
            `The installation on ${installation.accountLogin} already has ${githubTriggerInstallationCap} GitHub Triggers. Delete one, or widen an existing Trigger's events and filters.`
        );
    }
}

function signInRequired() {
    return new TriggerRequestRefusedError(
        'github_access_required',
        'GitHub needs a fresh sign-in for this connection. A Server Owner or Admin can sign in again on the GitHub connection page.'
    );
}
