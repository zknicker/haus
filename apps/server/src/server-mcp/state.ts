import {
    type McpConnection,
    type McpGrant,
    type McpIcon,
    type McpPreset,
    mcpIconSchema,
    mcpPresetIcons,
    mcpSummarySchema,
} from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
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
    const access = await requireServerMembership(db, member, input.serverId);
    if (!member || (access.role !== 'owner' && access.role !== 'admin')) {
        throw new McpDeniedError('Only a Server Owner or Admin can change Agent access.');
    }
    const [scope] = await db
        .select({ connected: mcpConnectionsTable.connected })
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
        await db.insert(agentMcpConnectionGrantsTable).values(key).onConflictDoNothing();
    } else {
        await db
            .delete(agentMcpConnectionGrantsTable)
            .where(
                and(
                    eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                    eq(agentMcpConnectionGrantsTable.agentId, input.agentId),
                    eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId)
                )
            );
    }
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
        icon: presetIcon(row.preset) ?? storedIcon(row.icon),
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

/**
 * `mcp.list` validates its whole output, so one malformed stored icon would
 * blank every connection rather than one row. Degrade the row instead.
 */
function storedIcon(value: unknown): McpIcon | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = mcpIconSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/**
 * A first-party preset always shows its bundled mark: Haus curates it at full
 * resolution, while discovery often resolves only a small favicon. Applied
 * here, at the read boundary, so every client gets it and stored rows stay the
 * discovery result.
 */
function presetIcon(preset: McpPreset | null): McpIcon | null {
    return preset ? mcpPresetIcons[preset] : null;
}

/** Same degrade-the-row rule as the icon: never fail the whole list. */
function storedSummary(value: null | string): null | string {
    if (value === null) {
        return null;
    }
    const parsed = mcpSummarySchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
