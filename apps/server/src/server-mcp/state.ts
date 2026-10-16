import { type McpConnection, type McpGrant, mcpSummarySchema } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { builtInConnection } from '../built-in-connections/built-in-connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readMcpConnectionIcon } from './connection-branding.ts';
import { McpDeniedError } from './errors.ts';

export async function listMcpConnections(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<McpConnection[]> {
    await requireServerMembership(db, member, serverId);
    const rows = await db
        .select()
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.serverId, serverId))
        .orderBy(asc(mcpConnectionsTable.name));
    const grants = await db
        .select({
            agentId: agentMcpConnectionGrantsTable.agentId,
            connectionId: agentMcpConnectionGrantsTable.connectionId,
        })
        .from(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.serverId, serverId));
    // A pure read: icons resolve at write time and by startup repair, never here.
    return rows.map((row) =>
        shapeMcpConnection(
            row,
            grants.filter((grant) => grant.connectionId === row.id)
        )
    );
}

export async function setMcpGrant(
    db: HausDatabase,
    member: HausUser | null,
    input: McpGrant & { enabled: boolean; serverId: string }
): Promise<McpGrant> {
    // Behind the Server lock, like a GitHub delivery's firing transaction, so a
    // revoked grant never loses the race with a Trigger fire.
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const access = await requireServerMembership(tx, member, input.serverId);
        if (!member || (access.role !== 'owner' && access.role !== 'admin')) {
            throw new McpDeniedError('Only a Server Owner or Admin can change Agent access.');
        }
        const [scope] = await tx
            .select({
                connected: mcpConnectionsTable.connected,
                preset: mcpConnectionsTable.preset,
            })
            .from(agentsTable)
            .innerJoin(
                mcpConnectionsTable,
                and(
                    eq(mcpConnectionsTable.serverId, agentsTable.serverId),
                    eq(mcpConnectionsTable.id, input.connectionId)
                )
            )
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);
        if (!scope) {
            throw new McpDeniedError('The Agent and MCP connection must share a Server.');
        }
        if (input.enabled && !scope.connected) {
            throw new McpDeniedError('Connect this MCP server before enabling Agent access.');
        }
        const key = {
            agentId: input.agentId,
            connectionId: input.connectionId,
            serverId: input.serverId,
        };
        if (input.enabled) {
            const added = await tx
                .insert(agentMcpConnectionGrantsTable)
                .values(key)
                .onConflictDoNothing()
                .returning({ agentId: agentMcpConnectionGrantsTable.agentId });
            if (added.length > 0) {
                await builtInConnection(scope.preset)?.agentGrantAdded?.(tx, key);
            }
        } else {
            await tx
                .delete(agentMcpConnectionGrantsTable)
                .where(
                    and(
                        eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                        eq(agentMcpConnectionGrantsTable.agentId, input.agentId),
                        eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId)
                    )
                );
            await builtInConnection(scope.preset)?.agentGrantRemoved?.(tx, key);
        }
    });
    return { agentId: input.agentId, connectionId: input.connectionId };
}

export function shapeMcpConnection(
    row: typeof mcpConnectionsTable.$inferSelect,
    grants: McpGrant[] = []
): McpConnection {
    return {
        accountLabel: row.accountLabel,
        auth: row.auth,
        connected: row.connected,
        grants,
        headerNames: row.headerNames,
        icon: readMcpConnectionIcon(row),
        id: row.id,
        name: row.name,
        preset: row.preset,
        serverId: row.serverId,
        status: row.connected ? 'online' : 'pending',
        summary: storedSummary(row.summary),
        tools: row.tools,
        url: row.url,
    };
}

/** Same degrade-the-row rule as the icon: never fail the whole list. */
function storedSummary(value: null | string): null | string {
    if (value === null) {
        return null;
    }
    const parsed = mcpSummarySchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
