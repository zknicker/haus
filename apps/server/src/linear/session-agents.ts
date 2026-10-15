import { and, eq, isNull, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    linearIdentitiesTable,
    linearWorkspacesTable,
    serversTable,
} from '../postgres/schema.ts';
import { agentLabelsByLinearId } from './agent-label-reads.ts';

// Who a Linear session belongs to (specs/linear-app.md#routing).

export interface SessionWorkspace {
    appUserId: string;
    connectionId: string | null;
    defaultAgentId: string | null;
    id: string;
    serverId: string;
    slug: string;
}

export interface SessionAgent {
    displayName: string;
    granted: boolean;
    handle: string;
    id: string;
    retired: boolean;
}

export async function readSessionWorkspace(
    tx: HausDatabase,
    workspaceId: string
): Promise<SessionWorkspace | null> {
    const [workspace] = await tx
        .select({
            appUserId: linearWorkspacesTable.appUserId,
            connectionId: linearWorkspacesTable.connectionId,
            defaultAgentId: linearWorkspacesTable.defaultAgentId,
            id: linearWorkspacesTable.id,
            serverId: linearWorkspacesTable.serverId,
            slug: serversTable.slug,
        })
        .from(linearWorkspacesTable)
        .innerJoin(serversTable, eq(serversTable.id, linearWorkspacesTable.serverId))
        .where(eq(linearWorkspacesTable.id, workspaceId))
        .limit(1);
    return workspace ?? null;
}

/**
 * The Haus app's routing order: the Agent the prompt names, then the issue's
 * current `Agent` label, then the workspace default. Only granted, active
 * Agents are candidates for the first two; the default is taken as set.
 */
export async function routeHausAppSession(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    input: { labelIds: readonly string[]; prompt: string | null }
): Promise<string | null> {
    const granted = await grantedAgents(tx, workspace);
    const named = input.prompt ? namedAgent(granted, input.prompt) : null;
    if (named) {
        return named;
    }
    const labelled = await agentLabelsByLinearId(tx, workspace.id, input.labelIds);
    const labelledAgent = labelled.find((label) =>
        granted.some((agent) => agent.id === label.agentId)
    );
    return labelledAgent?.agentId ?? workspace.defaultAgentId;
}

/** One Agent with the facts that decide whether it may take the session. */
export async function readSessionAgent(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    agentId: string
): Promise<SessionAgent | null> {
    const [agent] = await tx
        .select({
            displayName: agentsTable.displayName,
            handle: agentsTable.handle,
            id: agentsTable.id,
            retiredAt: agentsTable.retiredAt,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, workspace.serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    if (!agent) {
        return null;
    }
    const [grant] = workspace.connectionId
        ? await tx
              .select({ agentId: agentMcpConnectionGrantsTable.agentId })
              .from(agentMcpConnectionGrantsTable)
              .where(
                  and(
                      eq(agentMcpConnectionGrantsTable.serverId, workspace.serverId),
                      eq(agentMcpConnectionGrantsTable.agentId, agentId),
                      eq(agentMcpConnectionGrantsTable.connectionId, workspace.connectionId)
                  )
              )
              .limit(1)
        : [];
    return {
        displayName: agent.displayName,
        granted: grant !== undefined,
        handle: agent.handle,
        id: agent.id,
        retired: agent.retiredAt !== null,
    };
}

export async function readSessionIdentity(tx: HausDatabase, identityId: string) {
    const [identity] = await tx
        .select({
            agentId: linearIdentitiesTable.agentId,
            appUserId: linearIdentitiesTable.appUserId,
            id: linearIdentitiesTable.id,
            status: linearIdentitiesTable.status,
        })
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.id, identityId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .limit(1);
    return identity ?? null;
}

/** The earliest granted Agent handle the prompt names as a word ("@haus Beacon …"). */
function namedAgent(
    agents: readonly { handle: string; id: string }[],
    prompt: string
): string | null {
    let best: { at: number; id: string } | null = null;
    for (const agent of agents) {
        const pattern = new RegExp(`(^|[^\\w-])${escapeRegExp(agent.handle)}(?![\\w-])`, 'iu');
        const found = pattern.exec(prompt);
        if (found && (best === null || found.index < best.at)) {
            best = { at: found.index, id: agent.id };
        }
    }
    return best?.id ?? null;
}

async function grantedAgents(tx: HausDatabase, workspace: SessionWorkspace) {
    if (!workspace.connectionId) {
        return [];
    }
    return await tx
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
                eq(agentMcpConnectionGrantsTable.serverId, workspace.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, workspace.connectionId),
                isNull(agentsTable.retiredAt)
            )
        );
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
