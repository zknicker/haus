import {
    linearTriggerGroupsInputSchema,
    linearTriggerGroupsSchema,
    linearTriggerWorkspaceCap,
} from '@haus/api';
import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { workspaceCredentialId } from '../linear/agent-label-reads.ts';
import { holdsGrant, liveWorkspace } from '../linear/authority.ts';
import { LinearApiError } from '../linear/linear-api.ts';
import { LinearRefusedError, LinearSignInRequiredError } from '../linear/linear-errors.ts';
import type { LinearRuntime } from '../linear/linear-runtime.ts';
import { readTeamAccess } from '../linear/team-access.ts';
import { readLinearTriggerCatalog } from '../linear/trigger-catalog.ts';
import {
    type LinearGrantedAgent,
    type LinearTriggerConfigAuthoring,
    resolveLinearTriggerGroups,
} from '../linear/trigger-references.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    linearTriggerConfigsTable,
    triggersTable,
} from '../postgres/schema.ts';
import { TriggerRequestRefusedError } from './trigger-model.ts';

// Authoring checks for a `linear` Trigger (specs/linear-triggers.md#authoring).
// Names resolve against Linear before the transaction; the workspace, grant,
// and cap are re-checked inside it, behind the Server lock.

export interface LinearAuthoringDependencies {
    /** A valid access token for a credential row: the single refresh owner's. */
    accessToken(credentialId: string): Promise<string>;
    db: HausDatabase;
    fetch: typeof fetch;
}

/**
 * Authoring dependencies from the running Server's Linear runtime. Without a
 * configured Haus app nothing can refresh a token, so every read is a sign-in
 * refusal (`linear_workspace_unavailable`).
 */
export function linearAuthoring(
    db: HausDatabase,
    runtime: LinearRuntime | null
): LinearAuthoringDependencies {
    const refresher = runtime?.refresher ?? null;
    return {
        accessToken: async (credentialId) => {
            if (!refresher) {
                throw new LinearSignInRequiredError();
            }
            return (await refresher.fresh(credentialId, 60_000)).accessToken;
        },
        db,
        fetch: runtime?.app?.fetch ?? fetch,
    };
}

/** A configuration resolved to stable ids, ready to validate and store. */
export interface ResolvedLinearTriggerConfig {
    connectionId: string;
    display: typeof linearTriggerConfigsTable.$inferInsert.display;
    groups: typeof linearTriggerConfigsTable.$inferInsert.groups;
    workspaceId: string;
}

/**
 * Resolves the authoring groups to stored ids with the workspace actor's
 * token. Runs before the authoring transaction: no Linear call holds the
 * Server lock.
 */
export async function resolveLinearTriggerConfig(
    dependencies: LinearAuthoringDependencies,
    input: {
        config: LinearTriggerConfigAuthoring;
        now: Date;
        ownerAgentId: string;
        serverId: string;
    }
): Promise<ResolvedLinearTriggerConfig> {
    const { db } = dependencies;
    const scope = { connectionId: input.config.connectionId, serverId: input.serverId };
    const workspace = await requireActiveWorkspace(db, scope);
    const credentialId = await workspaceCredentialId(db, workspace.id);
    if (!credentialId) {
        throw workspaceUnavailable();
    }
    const grantedAgents = await grantedLinearAgents(db, scope);
    if (!grantedAgents.some((agent) => agent.id === input.ownerAgentId)) {
        throw accessRequired();
    }
    const teams = (await readTeamAccess(db, credentialId, input.now)).teams;
    const catalog = await readCatalog(dependencies, credentialId);
    const resolved = resolveLinearTriggerGroups(
        linearTriggerGroupsInputSchema.parse(input.config.groups),
        {
            catalog,
            grantedAgents,
            ownerAgentId: input.ownerAgentId,
            teams,
        }
    );
    return { ...resolved, connectionId: scope.connectionId, workspaceId: workspace.id };
}

/**
 * Inside the authoring transaction: the workspace is still the `active` one
 * the names resolved in, the owner still holds the grant, and the workspace
 * has room under its cap. A valid configuration clears any standing problem.
 */
export async function validateLinearTriggerConfig(
    tx: HausDatabase,
    input: {
        /** Excluded from the cap count when an existing Trigger is edited. */
        editingTriggerId: string | null;
        ownerAgentId: string;
        resolved: ResolvedLinearTriggerConfig;
        serverId: string;
    }
): Promise<Omit<typeof linearTriggerConfigsTable.$inferInsert, 'serverId' | 'triggerId'>> {
    const scope = { connectionId: input.resolved.connectionId, serverId: input.serverId };
    const workspace = await requireActiveWorkspace(tx, scope);
    if (workspace.id !== input.resolved.workspaceId) {
        throw workspaceUnavailable();
    }
    if (!(await holdsGrant(tx, { ...scope, agentId: input.ownerAgentId }))) {
        throw accessRequired();
    }
    const [row] = await tx
        .select({ total: count() })
        .from(linearTriggerConfigsTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, linearTriggerConfigsTable.serverId),
                eq(triggersTable.id, linearTriggerConfigsTable.triggerId)
            )
        )
        .where(
            and(
                eq(linearTriggerConfigsTable.serverId, input.serverId),
                eq(linearTriggerConfigsTable.workspaceId, workspace.id),
                isNull(triggersTable.deletedAt),
                input.editingTriggerId ? ne(triggersTable.id, input.editingTriggerId) : undefined
            )
        );
    if ((row?.total ?? 0) >= linearTriggerWorkspaceCap) {
        throw new TriggerRequestRefusedError(
            'linear_trigger_limit',
            `The ${workspace.name} workspace already has ${linearTriggerWorkspaceCap} Linear Triggers. Delete one, or widen an existing Trigger's groups.`
        );
    }
    return {
        display: input.resolved.display,
        groups: linearTriggerGroupsSchema.parse(input.resolved.groups),
        problem: null,
        problemSince: null,
        workspaceId: workspace.id,
    };
}

/** Agents granted on the connection, by handle, for `@agent:<handle>`. */
async function grantedLinearAgents(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
): Promise<LinearGrantedAgent[]> {
    return await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentMcpConnectionGrantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentMcpConnectionGrantsTable.serverId),
                eq(agentsTable.id, agentMcpConnectionGrantsTable.agentId)
            )
        )
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId),
                isNull(agentsTable.retiredAt)
            )
        );
}

async function readCatalog(dependencies: LinearAuthoringDependencies, credentialId: string) {
    try {
        const token = await dependencies.accessToken(credentialId);
        return await readLinearTriggerCatalog(dependencies.fetch, token);
    } catch (cause) {
        if (cause instanceof LinearRefusedError) {
            throw workspaceUnavailable();
        }
        if (cause instanceof LinearApiError) {
            throw new TriggerRequestRefusedError(
                'linear_reference_unavailable',
                'Linear did not list the workspace’s labels, states, and projects just now. Try again shortly.'
            );
        }
        throw cause;
    }
}

async function requireActiveWorkspace(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
) {
    const workspace = await liveWorkspace(db, input);
    if (workspace?.status !== 'active') {
        throw workspaceUnavailable();
    }
    return workspace;
}

function workspaceUnavailable() {
    return new TriggerRequestRefusedError(
        'linear_workspace_unavailable',
        'That Linear workspace is not connected and active on this Server. A Server Owner or Admin can connect or reconnect Linear in Settings → Connections.'
    );
}

function accessRequired() {
    return new TriggerRequestRefusedError(
        'linear_access_required',
        'The Agent has no access to the Linear connection. A Server Owner or Admin can grant it under the Linear connection’s Agent Access.'
    );
}
