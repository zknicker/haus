import { type GithubTriggerEventName, githubTriggerEventsSchema } from '@haus/api';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    githubInstallationsTable,
    githubTriggerConfigsTable,
    mcpConnectionsTable,
    triggersTable,
} from '../postgres/schema.ts';
import { count, field, type Payload } from './event-projection/payload.ts';
import { matchesGithubEvents, repositoryInScope } from './trigger-matching.ts';

/** A cache older than this cannot vouch for what the connection's user may see. */
export const githubAccessCacheMaxAgeMs = 24 * 60 * 60 * 1000;

type Installation = typeof githubInstallationsTable.$inferSelect;

/** Why a delivery reached no Trigger, recorded on its delivery row. */
export type GithubIgnoredReason =
    | 'installation_suspended'
    | 'no_installation'
    | 'no_repository'
    /** Recovery failed `maxRecoveryAttempts` sweeps running and dropped it. */
    | 'recovery_abandoned'
    | 'repository_inaccessible'
    | 'unknown_installation'
    | 'unsupported_event';

export type GithubRoute =
    | { ignored: GithubIgnoredReason; kind: 'ignored' }
    | { installation: Installation; kind: 'routed'; repositoryId: number };

/**
 * Routes a delivery to the one live installation row that holds its GitHub
 * installation, and refuses a repository outside that installation's access
 * cache before any Trigger is considered.
 */
export async function routeGithubDelivery(
    db: Pick<HausDatabase, 'select'>,
    payload: Payload
): Promise<GithubRoute> {
    const githubInstallationId = count(field(payload, 'installation'), 'id');
    if (githubInstallationId === null) {
        return { ignored: 'no_installation', kind: 'ignored' };
    }
    const [installation] = await db
        .select()
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.installationId, githubInstallationId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .limit(1);
    if (!installation) {
        return { ignored: 'unknown_installation', kind: 'ignored' };
    }
    if (installation.status !== 'active') {
        return { ignored: 'installation_suspended', kind: 'ignored' };
    }
    const repositoryId = count(field(payload, 'repository'), 'id');
    if (repositoryId === null) {
        return { ignored: 'no_repository', kind: 'ignored' };
    }
    if (!installation.accessibleRepositoryIds.includes(repositoryId)) {
        return { ignored: 'repository_inaccessible', kind: 'ignored' };
    }
    return { installation, kind: 'routed', repositoryId };
}

/** One Trigger a delivery should fire, before its rate limit is consulted. */
export interface GithubTriggerMatch {
    ownerAgentId: string;
    triggerId: string;
}

/**
 * Every armed, undeleted, problem-free `github` Trigger on the installation
 * that this delivery matches, split by whether it may fire. A connection that
 * is not connected, or an access cache older than a day, cannot vouch for the
 * user's access, so every match is `signInRequired`; a match whose owner lost
 * the connection grant is `accessRevoked`.
 */
export async function matchGithubTriggers(
    db: Pick<HausDatabase, 'select'>,
    input: {
        event: GithubTriggerEventName;
        installation: Installation;
        now: Date;
        payload: Payload;
        repositoryId: number;
    }
): Promise<{
    accessRevoked: GithubTriggerMatch[];
    fire: GithubTriggerMatch[];
    signInRequired: GithubTriggerMatch[];
}> {
    const { installation } = input;
    const candidates = await db
        .select({
            config: githubTriggerConfigsTable,
            ownerAgentId: triggersTable.ownerAgentId,
            triggerId: triggersTable.id,
        })
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
                isNull(githubTriggerConfigsTable.problem),
                eq(triggersTable.status, 'armed'),
                isNull(triggersTable.deletedAt)
            )
        );
    const matches = candidates
        .filter(({ config }) => {
            const events = githubTriggerEventsSchema.safeParse(config.events);
            return (
                events.success &&
                repositoryInScope({
                    accessibleRepositoryIds: installation.accessibleRepositoryIds,
                    repositoryId: input.repositoryId,
                    scope: config,
                }) &&
                matchesGithubEvents(events.data, input.event, input.payload)
            );
        })
        .map(({ ownerAgentId, triggerId }) => ({ ownerAgentId, triggerId }));
    const empty = { accessRevoked: [], fire: [], signInRequired: [] };
    if (matches.length === 0) {
        return empty;
    }
    if (!(await accessIsCurrent(db, installation, input.now))) {
        return { ...empty, signInRequired: matches };
    }
    const granted = await grantedAgents(db, installation, matches);
    return {
        accessRevoked: matches.filter((match) => !granted.has(match.ownerAgentId)),
        fire: matches.filter((match) => granted.has(match.ownerAgentId)),
        signInRequired: [],
    };
}

async function accessIsCurrent(
    db: Pick<HausDatabase, 'select'>,
    installation: Installation,
    now: Date
): Promise<boolean> {
    if (
        !(installation.connectionId && installation.accessSyncedAt) ||
        now.getTime() - installation.accessSyncedAt.getTime() > githubAccessCacheMaxAgeMs
    ) {
        return false;
    }
    const [connection] = await db
        .select({ connected: mcpConnectionsTable.connected })
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, installation.serverId),
                eq(mcpConnectionsTable.id, installation.connectionId)
            )
        )
        .limit(1);
    return connection?.connected === true;
}

async function grantedAgents(
    db: Pick<HausDatabase, 'select'>,
    installation: Installation,
    matches: readonly GithubTriggerMatch[]
): Promise<Set<string>> {
    if (!installation.connectionId) {
        return new Set();
    }
    const rows = await db
        .select({ agentId: agentMcpConnectionGrantsTable.agentId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, installation.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, installation.connectionId),
                inArray(
                    agentMcpConnectionGrantsTable.agentId,
                    matches.map((match) => match.ownerAgentId)
                )
            )
        );
    return new Set(rows.map((row) => row.agentId));
}
