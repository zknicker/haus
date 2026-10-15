import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import type { LinearTriggerConfigAuthoring } from '../linear/trigger-references.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMcpConnectionGrantsTable, linearWorkspacesTable } from '../postgres/schema.ts';
import { TriggerRequestRefusedError } from '../triggers/trigger-model.ts';

// An Agent names a `linear` Trigger's workspace by url key
// (specs/linear-triggers.md#agent-cli). The Server resolves it to the Linear
// connection among the workspaces the Agent holds the grant on; omitted, the
// Agent's only workspace (or, on update, the Trigger's current one) is used.

export async function resolveAgentLinearConfig(
    db: HausDatabase,
    runner: { agentId: string; serverId: string },
    input: { groups: LinearTriggerConfigAuthoring['groups']; workspace?: string },
    /** On update: the Trigger's current connection, kept when no workspace is named. */
    current?: () => Promise<string | null>
): Promise<LinearTriggerConfigAuthoring> {
    const key = input.workspace?.trim();
    const kept = !key && current ? await current() : null;
    if (kept) {
        return { connectionId: kept, groups: input.groups };
    }
    const workspaces = await grantedWorkspaces(db, runner);
    const keys = workspaces.map((workspace) => workspace.urlKey).join(', ');
    if (workspaces.length === 0) {
        throw new TriggerRequestRefusedError(
            'linear_workspace_unavailable',
            'No Linear workspace you can use. A Server Owner or Admin connects Linear in Settings → Connections and grants you the connection.'
        );
    }
    const match = key
        ? workspaces.find((workspace) =>
              [workspace.urlKey, workspace.name].some(
                  (name) => name.toLowerCase() === key.toLowerCase()
              )
          )
        : workspaces.length === 1
          ? workspaces[0]
          : undefined;
    if (!match) {
        throw key
            ? new TriggerRequestRefusedError(
                  'linear_workspace_unavailable',
                  `No Linear workspace you can use is ${key}. You can use: ${keys}.`
              )
            : new TriggerRequestRefusedError(
                  'linear_workspace_ambiguous',
                  `You can use several Linear workspaces; name one with --workspace: ${keys}.`
              );
    }
    if (match.status !== 'active') {
        throw new TriggerRequestRefusedError(
            'linear_workspace_unavailable',
            `The ${match.urlKey} Linear workspace is ${match.status.replaceAll('_', ' ')}. A Server Owner or Admin can reconnect Linear in Settings → Connections.`
        );
    }
    return { connectionId: match.connectionId, groups: input.groups };
}

async function grantedWorkspaces(db: HausDatabase, runner: { agentId: string; serverId: string }) {
    const rows = await db
        .select({
            connectionId: linearWorkspacesTable.connectionId,
            name: linearWorkspacesTable.name,
            status: linearWorkspacesTable.status,
            urlKey: linearWorkspacesTable.urlKey,
        })
        .from(linearWorkspacesTable)
        .innerJoin(
            agentMcpConnectionGrantsTable,
            and(
                eq(agentMcpConnectionGrantsTable.serverId, linearWorkspacesTable.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, linearWorkspacesTable.connectionId),
                eq(agentMcpConnectionGrantsTable.agentId, runner.agentId)
            )
        )
        .where(
            and(
                eq(linearWorkspacesTable.serverId, runner.serverId),
                ne(linearWorkspacesTable.status, 'removed'),
                isNotNull(linearWorkspacesTable.connectionId)
            )
        )
        .orderBy(asc(linearWorkspacesTable.urlKey));
    return rows.flatMap((row) =>
        row.connectionId ? [{ ...row, connectionId: row.connectionId }] : []
    );
}
