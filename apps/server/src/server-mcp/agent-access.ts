import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMcpConnectionGrantsTable, mcpConnectionsTable } from '../postgres/schema.ts';
import { McpDeniedError } from './errors.ts';
import { isModelToolNameOf } from './tool-catalog.ts';

export interface AgentScope {
    readonly agentId: string;
    readonly serverId: string;
}

export interface ConnectionRef {
    readonly id: string;
    readonly name: string;
}

/** A granted connection plus the service labels its tools are searchable by. */
export interface GrantedConnection extends ConnectionRef {
    readonly preset: string | null;
    readonly url: string;
}

export type ToolAccess =
    | { readonly kind: 'granted'; readonly connection: ConnectionRef }
    | { readonly kind: 'ungranted'; readonly connection: ConnectionRef }
    | { readonly kind: 'disconnected'; readonly connection: ConnectionRef }
    | { readonly kind: 'unknown' };

export interface ConnectionAccessRow {
    readonly connected: boolean;
    readonly granted: boolean;
    readonly id: string;
    readonly name: string;
}

export async function readGrantedConnections(
    db: HausDatabase,
    scope: AgentScope
): Promise<GrantedConnection[]> {
    return await db
        .select({
            id: mcpConnectionsTable.id,
            name: mcpConnectionsTable.name,
            preset: mcpConnectionsTable.preset,
            url: mcpConnectionsTable.url,
        })
        .from(agentMcpConnectionGrantsTable)
        .innerJoin(
            mcpConnectionsTable,
            and(
                eq(mcpConnectionsTable.serverId, agentMcpConnectionGrantsTable.serverId),
                eq(mcpConnectionsTable.id, agentMcpConnectionGrantsTable.connectionId)
            )
        )
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, scope.serverId),
                eq(agentMcpConnectionGrantsTable.agentId, scope.agentId),
                eq(mcpConnectionsTable.connected, true)
            )
        );
}

export async function hasConnectionGrant(
    db: HausDatabase,
    scope: AgentScope,
    connectionId: string
): Promise<boolean> {
    const [grant] = await db
        .select({ connectionId: agentMcpConnectionGrantsTable.connectionId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, scope.serverId),
                eq(agentMcpConnectionGrantsTable.agentId, scope.agentId),
                eq(agentMcpConnectionGrantsTable.connectionId, connectionId)
            )
        )
        .limit(1);
    return grant !== undefined;
}

export async function authorizeToolConnection(
    db: HausDatabase,
    scope: AgentScope,
    visibleName: string
): Promise<ConnectionRef> {
    const rows = await db
        .select({
            connected: mcpConnectionsTable.connected,
            grantedAgentId: agentMcpConnectionGrantsTable.agentId,
            id: mcpConnectionsTable.id,
            name: mcpConnectionsTable.name,
        })
        .from(mcpConnectionsTable)
        .leftJoin(
            agentMcpConnectionGrantsTable,
            and(
                eq(agentMcpConnectionGrantsTable.serverId, mcpConnectionsTable.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, mcpConnectionsTable.id),
                eq(agentMcpConnectionGrantsTable.agentId, scope.agentId)
            )
        )
        .where(eq(mcpConnectionsTable.serverId, scope.serverId));
    const access = decideToolAccess(
        rows.map((row) => ({
            connected: row.connected,
            granted: row.grantedAgentId !== null,
            id: row.id,
            name: row.name,
        })),
        visibleName
    );
    if (access.kind === 'granted') {
        return access.connection;
    }
    throw new McpDeniedError(deniedAccessMessage(access, visibleName));
}

export function decideToolAccess(
    rows: readonly ConnectionAccessRow[],
    visibleName: string
): ToolAccess {
    const matches = rows.filter((row) => isModelToolNameOf(visibleName, row.id));
    const row = matches.find((match) => match.granted && match.connected) ?? matches[0];
    if (!row) {
        return { kind: 'unknown' };
    }
    const connection = { id: row.id, name: row.name };
    if (!row.connected) {
        return { connection, kind: 'disconnected' };
    }
    if (!row.granted) {
        return { connection, kind: 'ungranted' };
    }
    return { connection, kind: 'granted' };
}

export function missingGrantMessage(connectionName: string): string {
    return `This Agent has no access to the ${connectionName} connection. Ask a Server Owner or Admin to grant this Agent access to ${connectionName}.`;
}

export function toolNotOffered(connection: ConnectionRef, visibleName: string): McpDeniedError {
    return new McpDeniedError(
        `The ${connection.name} connection does not offer ${visibleName}. Run tools.search to find its current tools.`
    );
}

function deniedAccessMessage(
    access: Exclude<ToolAccess, { kind: 'granted' }>,
    visibleName: string
): string {
    switch (access.kind) {
        case 'ungranted':
            return missingGrantMessage(access.connection.name);
        case 'disconnected':
            return `The ${access.connection.name} connection is disconnected. Ask a Server Owner or Admin to reconnect ${access.connection.name} and grant this Agent access to it.`;
        case 'unknown':
            return `No connection on this Haus Server offers ${visibleName}. Run tools.search to find the tools this Agent can use.`;
        default: {
            const unreachable: never = access;
            return unreachable;
        }
    }
}
