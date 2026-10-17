import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { AgentWake } from '../built-in-connections/built-in-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { liveWorkspace } from './authority.ts';
import { type LinearCredential, revokeLinearCredentials } from './credentials.ts';
import { handBackIdentityIssues } from './handoff.ts';
import { labelLifecycle } from './label-lifecycle.ts';
import { orphanLinearSessions } from './sessions.ts';
import { rederiveLinearTriggerProblems } from './trigger-problem-wakes.ts';

// Workspace, identity, and Agent state machines (specs/linear-app.md#lifecycle).
// Every function runs inside the caller's transaction, under the Server row
// lock; Linear calls go to the outbox, never inline.

/**
 * A credential left `valid` at its current generation: its actor follows.
 * The workspace actor takes the workspace (and its connection) with it; an
 * identity credential takes only that identity.
 */
export async function credentialFailed(
    tx: HausDatabase,
    credential: LinearCredential,
    now: Date
): Promise<AgentWake[]> {
    if (credential.state === 'valid') {
        return [];
    }
    if (credential.identityId) {
        const from =
            credential.state === 'revoked'
                ? (['active', 'inactive', 'refresh_required'] as const)
                : (['active', 'inactive'] as const);
        await tx
            .update(linearIdentitiesTable)
            .set({ status: credential.state, updatedAt: now })
            .where(
                and(
                    eq(linearIdentitiesTable.id, credential.identityId),
                    inArray(linearIdentitiesTable.status, [...from])
                )
            );
        // Leaving `active` orphans the identity's open sessions.
        await orphanLinearSessions(tx, {
            identityId: credential.identityId,
            now,
            serverId: credential.serverId,
        });
        return [];
    }
    const from =
        credential.state === 'revoked'
            ? (['active', 'refresh_required'] as const)
            : (['active'] as const);
    const [workspace] = await tx
        .update(linearWorkspacesTable)
        .set({ status: credential.state, updatedAt: now })
        .where(
            and(
                eq(linearWorkspacesTable.id, credential.workspaceId),
                inArray(linearWorkspacesTable.status, [...from])
            )
        )
        .returning();
    if (workspace?.connectionId) {
        await tx
            .update(mcpConnectionsTable)
            .set({ connected: false })
            .where(eq(mcpConnectionsTable.id, workspace.connectionId));
    }
    return await rederiveLinearTriggerProblems(tx, {
        now,
        scope: { workspaceId: credential.workspaceId },
        serverId: credential.serverId,
    });
}

/** Sign-out: the credential goes and is revoked; grants are cleared by generic code; the binding stays. */
export async function disconnectLinearWorkspace(
    tx: HausDatabase,
    input: { connectionId: string; now: Date; serverId: string }
): Promise<void> {
    const workspace = await liveWorkspace(tx, input);
    if (!workspace) {
        return;
    }
    await tx
        .update(linearWorkspacesTable)
        .set({ status: 'disconnected', updatedAt: input.now })
        .where(eq(linearWorkspacesTable.id, workspace.id));
    await revokeWorkspaceActor(tx, workspace.id, input.now);
}

/**
 * Deletion: a tombstone with no connection, binding released, identities
 * removed, every credential revoked.
 */
export async function removeLinearWorkspace(
    tx: HausDatabase,
    input: { connectionId: string; now: Date; serverId: string }
): Promise<void> {
    const workspace = await liveWorkspace(tx, input);
    if (!workspace) {
        return;
    }
    const identities = await tx
        .select()
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, workspace.id),
                ne(linearIdentitiesTable.status, 'removed')
            )
        );
    for (const identity of identities) {
        await removeLinearIdentity(tx, identity.id, input.now, { handBack: false });
    }
    await orphanLinearSessions(tx, {
        now: input.now,
        serverId: input.serverId,
        workspaceId: workspace.id,
    });
    await revokeWorkspaceActor(tx, workspace.id, input.now);
    await tx
        .update(linearWorkspacesTable)
        .set({
            connectionId: null,
            defaultAgentId: null,
            removedAt: input.now,
            status: 'removed',
            updatedAt: input.now,
        })
        .where(eq(linearWorkspacesTable.id, workspace.id));
}

/**
 * Any live identity → `removed`: credential revoked, secrets deleted, open
 * sessions orphaned. With `handBack`, its open delegated issues return to the
 * Haus app through the outbox; a workspace being removed has no actor left to
 * make that call, so it passes false.
 */
export async function removeLinearIdentity(
    tx: HausDatabase,
    identityId: string,
    now: Date,
    options: { handBack: boolean }
): Promise<void> {
    const [identity] = await tx
        .select()
        .from(linearIdentitiesTable)
        .where(eq(linearIdentitiesTable.id, identityId))
        .limit(1);
    if (!identity || identity.status === 'removed') {
        return;
    }
    await orphanLinearSessions(tx, { identityId, now, serverId: identity.serverId });
    // A draft never installed, so nothing was ever delegated to it.
    if (options.handBack && identity.appUserId) {
        await handBackIdentityIssues(tx, {
            identityUserId: identity.appUserId,
            now,
            workspaceId: identity.workspaceId,
        });
    }
    const credentials = await tx
        .select({ id: linearCredentialsTable.id })
        .from(linearCredentialsTable)
        .where(eq(linearCredentialsTable.identityId, identityId));
    await revokeLinearCredentials(tx, {
        credentialIds: credentials.map((credential) => credential.id),
        now,
    });
    await tx
        .delete(linearIdentitySecretsTable)
        .where(eq(linearIdentitySecretsTable.identityId, identityId));
    await tx
        .update(linearIdentitiesTable)
        .set({ removedAt: now, status: 'removed', updatedAt: now })
        .where(
            and(
                eq(linearIdentitiesTable.id, identityId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        );
}

/** A grant on this connection: labels pending; an `inactive` identity returns to `active`. */
export async function linearGrantAdded(
    tx: HausDatabase,
    input: { agentId: string; connectionId: string; serverId: string },
    now: Date
): Promise<void> {
    await labelLifecycle.agentGrantAdded(tx, input, now);
    const workspace = await liveWorkspace(tx, input);
    if (workspace) {
        await setAgentIdentityStatus(tx, workspace.id, input.agentId, 'inactive', 'active', now);
    }
}

/** A revoked grant: identity `inactive`, labels archived, default Agent cleared. */
export async function linearGrantRemoved(
    tx: HausDatabase,
    input: { agentId: string; connectionId: string; serverId: string },
    now: Date
): Promise<void> {
    const workspace = await liveWorkspace(tx, input);
    if (workspace) {
        await setAgentIdentityStatus(tx, workspace.id, input.agentId, 'active', 'inactive', now);
        if (workspace.defaultAgentId === input.agentId) {
            await tx
                .update(linearWorkspacesTable)
                .set({ defaultAgentId: null, updatedAt: now })
                .where(eq(linearWorkspacesTable.id, workspace.id));
        }
        await orphanLinearSessions(tx, {
            agentId: input.agentId,
            now,
            serverId: input.serverId,
            workspaceId: workspace.id,
        });
    }
    await labelLifecycle.agentGrantRemoved(tx, input, now);
}

/** A retiring Agent: every identity removed, labels archived, default Agent cleared. */
export async function linearAgentRetired(
    tx: HausDatabase,
    input: { agentId: string; serverId: string },
    now: Date
): Promise<void> {
    const identities = await tx
        .select({ id: linearIdentitiesTable.id })
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.serverId, input.serverId),
                eq(linearIdentitiesTable.agentId, input.agentId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        );
    for (const identity of identities) {
        await removeLinearIdentity(tx, identity.id, now, { handBack: true });
    }
    await tx
        .update(linearWorkspacesTable)
        .set({ defaultAgentId: null, updatedAt: now })
        .where(
            and(
                eq(linearWorkspacesTable.serverId, input.serverId),
                eq(linearWorkspacesTable.defaultAgentId, input.agentId)
            )
        );
    await orphanLinearSessions(tx, { agentId: input.agentId, now, serverId: input.serverId });
    await labelLifecycle.agentRetired(tx, input, now);
}

async function revokeWorkspaceActor(tx: HausDatabase, workspaceId: string, now: Date) {
    const credentials = await tx
        .select({ id: linearCredentialsTable.id })
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, workspaceId),
                isNull(linearCredentialsTable.identityId)
            )
        );
    await revokeLinearCredentials(tx, {
        credentialIds: credentials.map((credential) => credential.id),
        now,
    });
}

async function setAgentIdentityStatus(
    tx: HausDatabase,
    workspaceId: string,
    agentId: string,
    from: 'active' | 'inactive',
    to: 'active' | 'inactive',
    now: Date
) {
    await tx
        .update(linearIdentitiesTable)
        .set({ status: to, updatedAt: now })
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, workspaceId),
                eq(linearIdentitiesTable.agentId, agentId),
                eq(linearIdentitiesTable.status, from)
            )
        );
}
