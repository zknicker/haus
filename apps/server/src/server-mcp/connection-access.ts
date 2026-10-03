import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { McpDeniedError } from './errors.ts';

/** Connection reads and writes are Server Owner or Admin work. */
export async function requireOperableConnection(
    db: HausDatabase,
    member: HausUser | null,
    input: { connectionId: string; serverId: string }
) {
    await requireAdmin(db, member, input.serverId, 'change a connection');
    return await requireConnection(db, input);
}

export async function requireAdmin(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string,
    action: string
) {
    const access = await requireServerMembership(db, member, serverId);
    if (!member || (access.role !== 'owner' && access.role !== 'admin')) {
        throw new McpDeniedError(`Only a Server Owner or Admin can ${action}.`);
    }
}

export async function requireConnection(
    db: HausDatabase,
    input: { connectionId: string; serverId: string }
) {
    const [row] = await db
        .select()
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, input.serverId),
                eq(mcpConnectionsTable.id, input.connectionId)
            )
        )
        .limit(1);
    if (!row) {
        throw new McpDeniedError('The MCP connection was not found.');
    }
    return row;
}
