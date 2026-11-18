import type { WorkspaceFileContent, WorkspaceFileList } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function listAgentWorkspace(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: { agentId: string; includeHidden: boolean; path: string; serverId: string }
): Promise<WorkspaceFileList> {
    const computerId = await requireWorkspaceAccess(db, member, input);
    const result = await connections.requestWorkspace(computerId, {
        agentId: input.agentId,
        operation: {
            includeHidden: input.includeHidden,
            kind: 'list',
            path: input.path,
        },
    });
    if (result.kind !== 'list') {
        throw new Error('The Computer returned the wrong workspace response.');
    }
    return result.value;
}

export async function readAgentWorkspaceFile(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: { agentId: string; includeHidden: boolean; path: string; serverId: string }
): Promise<WorkspaceFileContent> {
    const computerId = await requireWorkspaceAccess(db, member, input);
    const result = await connections.requestWorkspace(computerId, {
        agentId: input.agentId,
        operation: {
            includeHidden: input.includeHidden,
            kind: 'read',
            path: input.path,
        },
    });
    if (result.kind !== 'read') {
        throw new Error('The Computer returned the wrong workspace response.');
    }
    return result.value;
}

async function requireWorkspaceAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
) {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentWorkspaceAccessError(
            'Only a Server Owner or Admin can inspect an Agent workspace.'
        );
    }
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, input.agentId), eq(agentsTable.serverId, input.serverId)))
        .limit(1);
    if (!agent?.computerId) {
        throw new AgentWorkspaceAccessError('No Agent exists with that id.');
    }
    return agent.computerId;
}

export class AgentWorkspaceAccessError extends Error {}
