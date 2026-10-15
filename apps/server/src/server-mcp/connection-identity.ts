import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMcpConnectionGrantsTable, mcpConnectionsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { McpRuntime } from './runtime.ts';

/** Forgets a connection's account: closes its client, drops Agent grants, and clears its catalog. */
export async function clearMcpIdentity(
    db: HausDatabase,
    runtime: McpRuntime,
    serverId: string,
    connectionId: string
) {
    await runtime.closeConnection(connectionId);
    await db.transaction(async (tx) => {
        await lockServerRow(tx, serverId);
        await tx
            .delete(agentMcpConnectionGrantsTable)
            .where(eq(agentMcpConnectionGrantsTable.connectionId, connectionId));
        await tx
            .update(mcpConnectionsTable)
            .set({ accountLabel: null, connected: false, summary: null, tools: [] })
            .where(
                and(
                    eq(mcpConnectionsTable.serverId, serverId),
                    eq(mcpConnectionsTable.id, connectionId)
                )
            );
    });
}
