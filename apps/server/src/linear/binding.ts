import type { McpIcon } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { linearIdentitiesTable, linearWorkspacesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { holdsGrant, requireAdminRole } from './authority.ts';
import { storeLinearCredential } from './credentials.ts';
import { labelLifecycle } from './label-lifecycle.ts';
import type { LinearTokenPair } from './linear-api.ts';
import { LinearRefusedError } from './linear-errors.ts';
import type { LinearInstallFacts } from './linear-install-reads.ts';
import type { LinearAttempt } from './oauth-attempts.ts';
import { replaceTeamAccess } from './team-access.ts';
import { rederiveLinearTriggerProblems } from './trigger-problem-wakes.ts';
import { insertLinearConnection, reconnectLinearConnection } from './workspace-connection.ts';

// Binding authority (specs/linear-app.md#binding-and-authority). Linear facts
// are read with the new token before this runs; here, under the Server row
// lock, the initiating user's Owner or Admin role is rechecked and the binding
// is stored in one transaction. Conflicts never name the other Server.

export type LinearBindResult =
    | { connectionId: string; kind: 'workspace_connected' | 'workspace_reconnected' }
    | {
          connectionId: string;
          /** The identity's credential, whose team memberships the install joins after commit. */
          credentialId: string;
          kind: 'identity_installed';
          workspaceId: string;
      };

export interface LinearBindInput {
    attempt: LinearAttempt;
    facts: LinearInstallFacts;
    /** Linear's brand icon, resolved before the transaction; null when the lookup failed. */
    icon: McpIcon | null;
    now: Date;
    tokens: LinearTokenPair;
}

export async function bindLinearInstall(
    db: HausDatabase,
    input: LinearBindInput
): Promise<LinearBindResult> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, input.attempt.serverId);
            await requireAdminRole(tx, input.attempt.serverId, input.attempt.initiatedByUserId);
            switch (input.attempt.purpose) {
                case 'workspace_install':
                    return await bindNewWorkspace(tx, input);
                case 'workspace_reconnect':
                    return await rebindWorkspace(tx, input);
                case 'identity_install':
                    return await bindIdentity(tx, input);
                default:
                    throw new Error('Unknown Linear install purpose.');
            }
        });
    } catch (cause) {
        if (violatesConstraint(cause, 'linear_workspaces_live_organization_key')) {
            throw workspaceBoundElsewhere();
        }
        if (
            violatesConstraint(cause, 'linear_identities_live_app_user_key') ||
            violatesConstraint(cause, 'linear_identities_live_client_key')
        ) {
            throw identityBoundElsewhere();
        }
        throw cause;
    }
}

async function bindNewWorkspace(
    tx: HausDatabase,
    input: LinearBindInput
): Promise<LinearBindResult> {
    const { attempt, facts, now } = input;
    const [bound] = await tx
        .select({ id: linearWorkspacesTable.id })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.organizationId, facts.organization.id),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .limit(1);
    if (bound) {
        throw workspaceBoundElsewhere();
    }
    const connectionId = await insertLinearConnection(tx, {
        accountLabel: facts.organization.urlKey,
        icon: input.icon,
        serverId: attempt.serverId,
    });
    const workspaceId = createOpaqueId('lnw');
    await tx.insert(linearWorkspacesTable).values({
        appUserId: facts.appUser.id,
        boundByUserId: attempt.initiatedByUserId,
        connectionId,
        createdAt: now,
        id: workspaceId,
        name: facts.organization.name,
        organizationId: facts.organization.id,
        serverId: attempt.serverId,
        status: 'active',
        teamsSyncedAt: now,
        updatedAt: now,
        urlKey: facts.organization.urlKey,
    });
    await storeActor(tx, { ...input, identityId: null, workspaceId });
    await labelLifecycle.teamsChanged(tx, { serverId: attempt.serverId, workspaceId }, now);
    return { connectionId, kind: 'workspace_connected' };
}

async function rebindWorkspace(
    tx: HausDatabase,
    input: LinearBindInput
): Promise<LinearBindResult> {
    const { attempt, facts, now } = input;
    const workspace = await attemptWorkspace(tx, attempt);
    if (workspace.organizationId !== facts.organization.id) {
        throw new LinearRefusedError(
            'CONFLICT',
            'linear_organization_mismatch',
            'Reconnect with the Linear workspace this connection is bound to.'
        );
    }
    await tx
        .update(linearWorkspacesTable)
        .set({
            appUserId: facts.appUser.id,
            boundByUserId: attempt.initiatedByUserId,
            name: facts.organization.name,
            status: 'active',
            teamsSyncedAt: now,
            updatedAt: now,
            urlKey: facts.organization.urlKey,
        })
        .where(eq(linearWorkspacesTable.id, workspace.id));
    await reconnectLinearConnection(tx, {
        accountLabel: facts.organization.urlKey,
        connectionId: workspace.connectionId,
        icon: input.icon,
    });
    await storeActor(tx, { ...input, identityId: null, workspaceId: workspace.id });
    await labelLifecycle.teamsChanged(
        tx,
        { serverId: attempt.serverId, workspaceId: workspace.id },
        now
    );
    // Reconnecting clears sign-in problems; clearing notifies nobody.
    await rederiveLinearTriggerProblems(tx, {
        now,
        scope: { workspaceId: workspace.id },
        serverId: attempt.serverId,
    });
    return { connectionId: workspace.connectionId, kind: 'workspace_reconnected' };
}

async function bindIdentity(tx: HausDatabase, input: LinearBindInput): Promise<LinearBindResult> {
    const { attempt, facts, now } = input;
    const workspace = await attemptWorkspace(tx, attempt);
    const [identity] = await tx
        .select()
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.id, attempt.identityId ?? ''),
                eq(linearIdentitiesTable.workspaceId, workspace.id),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .for('update')
        .limit(1);
    if (!identity) {
        throw new LinearRefusedError(
            'NOT_FOUND',
            'linear_identity_not_found',
            'That Linear identity was removed.'
        );
    }
    if (identity.organizationId !== facts.organization.id) {
        throw new LinearRefusedError(
            'CONFLICT',
            'linear_organization_mismatch',
            'Install the identity in the Linear workspace this connection is bound to.'
        );
    }
    if (
        facts.appUser.id === workspace.appUserId ||
        (identity.appUserId !== null && identity.appUserId !== facts.appUser.id)
    ) {
        throw new LinearRefusedError(
            'CONFLICT',
            'linear_identity_mismatch',
            "That Linear app is not this Agent's identity app."
        );
    }
    const granted = await holdsGrant(tx, {
        agentId: identity.agentId,
        connectionId: workspace.connectionId,
        serverId: attempt.serverId,
    });
    let status: 'active' | 'inactive' = granted ? 'active' : 'inactive';
    if (identity.status === 'active' || identity.status === 'inactive') {
        // Re-authorizing an installed app keeps its state.
        status = identity.status;
    }
    await tx
        .update(linearIdentitiesTable)
        .set({
            appUserId: facts.appUser.id,
            handle: facts.appUser.displayName,
            status,
            updatedAt: now,
        })
        .where(eq(linearIdentitiesTable.id, identity.id));
    const credentialId = await storeActor(tx, {
        ...input,
        identityId: identity.id,
        workspaceId: workspace.id,
    });
    return {
        connectionId: workspace.connectionId,
        credentialId,
        kind: 'identity_installed',
        workspaceId: workspace.id,
    };
}

async function storeActor(
    tx: HausDatabase,
    input: {
        attempt: LinearAttempt;
        facts: LinearInstallFacts;
        identityId: string | null;
        now: Date;
        tokens: LinearTokenPair;
        workspaceId: string;
    }
): Promise<string> {
    const credential = await storeLinearCredential(tx, {
        identityId: input.identityId,
        now: input.now,
        serverId: input.attempt.serverId,
        tokens: input.tokens,
        workspaceId: input.workspaceId,
    });
    await replaceTeamAccess(tx, {
        credentialId: credential.id,
        now: input.now,
        serverId: input.attempt.serverId,
        teams: input.facts.teams,
    });
    return credential.id;
}

/** The live workspace an attempt names through its connection. */
async function attemptWorkspace(tx: HausDatabase, attempt: LinearAttempt) {
    const [workspace] = await tx
        .select()
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, attempt.serverId),
                eq(linearWorkspacesTable.connectionId, attempt.connectionId ?? ''),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .for('update')
        .limit(1);
    if (!workspace?.connectionId) {
        throw new LinearRefusedError(
            'NOT_FOUND',
            'linear_connection_not_found',
            'That Linear connection was removed.'
        );
    }
    return { ...workspace, connectionId: workspace.connectionId };
}

function workspaceBoundElsewhere() {
    return new LinearRefusedError(
        'CONFLICT',
        'linear_workspace_already_bound',
        'This Linear workspace is already connected to a Haus Server.'
    );
}

function identityBoundElsewhere() {
    return new LinearRefusedError(
        'CONFLICT',
        'linear_identity_already_bound',
        'This Linear app is already a Haus Agent identity.'
    );
}
