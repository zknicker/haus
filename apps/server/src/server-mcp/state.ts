import { type McpConnection, type McpGrant, mcpSummarySchema } from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
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
import {
    ConnectionAdminRequiredError,
    McpGrantDisconnectedError,
    McpGrantScopeError,
} from './grant-errors.ts';

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

type McpGrantChange = McpGrant & { enabled: boolean; serverId: string };

/** Who may change a grant: a human Owner or Admin, or an Agent the Server made a connection admin. */
export type McpGrantAuthority =
    | { kind: 'agent'; agentId: string }
    | { kind: 'member'; member: HausUser | null };

/** The human path (`mcp.setGrant`): only a Server Owner or Admin. */
export async function setMcpGrant(
    db: HausDatabase,
    member: HausUser | null,
    input: McpGrantChange
): Promise<McpGrant> {
    await writeMcpGrant(db, { kind: 'member', member }, input);
    return { agentId: input.agentId, connectionId: input.connectionId };
}

/**
 * The one grant write both paths share; they differ only in who is authorized. Returns whether
 * the grant changed, so a repeated grant or revoke reads as a no-op.
 */
export async function writeMcpGrant(
    db: HausDatabase,
    authority: McpGrantAuthority,
    input: McpGrantChange
): Promise<{ changed: boolean }> {
    // Behind the Server lock, like a GitHub delivery's firing transaction, so a
    // revoked grant never loses the race with a Trigger fire.
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await authorizeGrantChange(tx, authority, input.serverId);
        const [scope] = await tx
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
            throw new McpGrantScopeError();
        }
        if (input.enabled && !scope.connected) {
            throw new McpGrantDisconnectedError();
        }
        const key = {
            agentId: input.agentId,
            connectionId: input.connectionId,
            serverId: input.serverId,
        };
        const written = input.enabled
            ? await tx
                  .insert(agentMcpConnectionGrantsTable)
                  .values(key)
                  .onConflictDoNothing()
                  .returning({ agentId: agentMcpConnectionGrantsTable.agentId })
            : await tx
                  .delete(agentMcpConnectionGrantsTable)
                  .where(
                      and(
                          eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                          eq(agentMcpConnectionGrantsTable.agentId, input.agentId),
                          eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId)
                      )
                  )
                  .returning({ agentId: agentMcpConnectionGrantsTable.agentId });
        return { changed: written.length > 0 };
    });
}

/** Runs behind the Server lock, so a just-revoked role or flag is already visible. */
async function authorizeGrantChange(
    tx: Pick<HausDatabase, 'select'>,
    authority: McpGrantAuthority,
    serverId: string
): Promise<void> {
    if (authority.kind === 'agent') {
        if (!(await isConnectionAdmin(tx, serverId, authority.agentId))) {
            throw new ConnectionAdminRequiredError();
        }
        return;
    }
    const access = await requireServerMembership(tx, authority.member, serverId);
    if (!authority.member || (access.role !== 'owner' && access.role !== 'admin')) {
        throw new McpDeniedError('Only a Server Owner or Admin can change Agent access.');
    }
}

/** Whether this active Agent of the Server holds the human-set connection admin flag. */
export async function isConnectionAdmin(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    agentId: string
): Promise<boolean> {
    const [agent] = await db
        .select({ connectionAdmin: agentsTable.connectionAdmin })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return agent?.connectionAdmin === true;
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
