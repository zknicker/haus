import {
    type GithubTriggerEvents,
    type GithubTriggerProblem,
    githubTriggerEventPermission,
} from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    githubInstallationsTable,
    githubTriggerConfigsTable,
    mcpConnectionsTable,
    triggersTable,
} from '../postgres/schema.ts';
import {
    clearGithubTriggersProblem,
    type GithubTriggerProblemEntered,
    markGithubTriggersProblem,
} from './trigger-problems.ts';

/** An access cache older than this puts dependent Triggers into `sign_in_required`. */
export const githubAccessStaleMs = 24 * 60 * 60_000;

type InstallationRow = typeof githubInstallationsTable.$inferSelect;

/**
 * Derives every armed `github` Trigger's problem on one installation from the
 * installation's current state, then enters new problems (one notice each) and
 * clears problems whose cause is gone, inside the caller's transaction.
 */
export async function syncGithubTriggerProblems(
    tx: HausDatabase,
    input: { installation: InstallationRow; now: Date; triggerIds?: readonly string[] }
): Promise<GithubTriggerProblemEntered[]> {
    const { installation, now } = input;
    if (input.triggerIds?.length === 0) {
        return [];
    }
    const triggers = await tx
        .select({
            events: githubTriggerConfigsTable.events,
            id: githubTriggerConfigsTable.triggerId,
            ownerAgentId: triggersTable.ownerAgentId,
            problem: githubTriggerConfigsTable.problem,
            repositoryIds: githubTriggerConfigsTable.repositoryIds,
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
                input.triggerIds
                    ? inArray(githubTriggerConfigsTable.triggerId, [...input.triggerIds])
                    : undefined,
                eq(triggersTable.status, 'armed'),
                isNull(triggersTable.deletedAt)
            )
        );
    if (triggers.length === 0) {
        return [];
    }
    const facts = await connectionFacts(tx, installation);
    const desired = new Map<GithubTriggerProblem, string[]>();
    const clear: string[] = [];
    for (const trigger of triggers) {
        const problem = desiredProblem(installation, facts, trigger, now);
        if (problem === null) {
            if (trigger.problem !== null) {
                clear.push(trigger.id);
            }
        } else if (problem !== trigger.problem) {
            desired.set(problem, [...(desired.get(problem) ?? []), trigger.id]);
        }
    }
    await clearGithubTriggersProblem(tx, {
        now,
        serverId: installation.serverId,
        triggerIds: clear,
    });
    const entered: GithubTriggerProblemEntered[] = [];
    for (const [problem, triggerIds] of desired) {
        const marked = await markGithubTriggersProblem(tx, {
            now,
            problem,
            scope: { triggerIds },
            serverId: installation.serverId,
        });
        entered.push(...marked.entered);
    }
    return entered;
}

/**
 * Re-derives one `github` Trigger's problem when it is armed again. Problems
 * only track armed Triggers, so a Trigger disabled while its installation was
 * removed, suspended, or signed out would otherwise come back clean and
 * silently never fire.
 */
export async function syncArmedGithubTrigger(
    tx: HausDatabase,
    input: { now: Date; serverId: string; triggerId: string }
): Promise<GithubTriggerProblemEntered[]> {
    const [row] = await tx
        .select({ installation: githubInstallationsTable })
        .from(githubTriggerConfigsTable)
        .innerJoin(
            githubInstallationsTable,
            and(
                eq(githubInstallationsTable.serverId, githubTriggerConfigsTable.serverId),
                eq(githubInstallationsTable.id, githubTriggerConfigsTable.installationRowId)
            )
        )
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, input.serverId),
                eq(githubTriggerConfigsTable.triggerId, input.triggerId)
            )
        )
        .limit(1);
    if (!row) {
        return [];
    }
    return await syncGithubTriggerProblems(tx, {
        installation: row.installation,
        now: input.now,
        triggerIds: [input.triggerId],
    });
}

interface ConnectionFacts {
    connected: boolean;
    grantedAgentIds: Set<string>;
}

/** The first problem that applies, most fundamental first. */
export function desiredProblem(
    installation: Pick<
        InstallationRow,
        'accessSyncedAt' | 'accessibleRepositoryIds' | 'permissions' | 'status'
    >,
    facts: ConnectionFacts,
    trigger: { events: GithubTriggerEvents; ownerAgentId: string; repositoryIds: number[] },
    now: Date
): GithubTriggerProblem | null {
    if (installation.status === 'removed') {
        return 'installation_removed';
    }
    if (installation.status === 'suspended') {
        return 'installation_suspended';
    }
    const accessAge = installation.accessSyncedAt
        ? now.getTime() - installation.accessSyncedAt.getTime()
        : Number.POSITIVE_INFINITY;
    if (!facts.connected || accessAge > githubAccessStaleMs) {
        return 'sign_in_required';
    }
    if (!facts.grantedAgentIds.has(trigger.ownerAgentId)) {
        return 'agent_access_revoked';
    }
    const missingPermission = trigger.events.some(
        (entry) => !installation.permissions[githubTriggerEventPermission[entry.event]]
    );
    if (missingPermission) {
        return 'permissions_missing';
    }
    const accessible = new Set(installation.accessibleRepositoryIds);
    if (trigger.repositoryIds.some((id) => !accessible.has(id))) {
        return 'repositories_unavailable';
    }
    return null;
}

async function connectionFacts(
    tx: HausDatabase,
    installation: InstallationRow
): Promise<ConnectionFacts> {
    if (!installation.connectionId) {
        return { connected: false, grantedAgentIds: new Set() };
    }
    const [connection] = await tx
        .select({ connected: mcpConnectionsTable.connected })
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, installation.serverId),
                eq(mcpConnectionsTable.id, installation.connectionId)
            )
        )
        .limit(1);
    const grants = await tx
        .select({ agentId: agentMcpConnectionGrantsTable.agentId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, installation.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, installation.connectionId)
            )
        );
    return {
        connected: connection?.connected ?? false,
        grantedAgentIds: new Set(grants.map((grant) => grant.agentId)),
    };
}
