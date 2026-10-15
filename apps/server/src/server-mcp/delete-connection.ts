import type { McpConnection } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { builtInConnection } from '../built-in-connections/built-in-connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireOperableConnection } from './connection-access.ts';
import type { McpRuntime } from './runtime.ts';
import { shapeMcpConnection } from './state.ts';

/**
 * Deletes a connection and, with it, its secret and Agent grants. A built-in
 * connection first runs its `beforeDelete` in the same transaction; `wake`
 * dispatches the Agents it returns after commit.
 */
export async function deleteMcpConnection(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { connectionId: string; serverId: string },
    wake: (wakes: { agentId: string; serverId: string }[]) => void = () => undefined
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    await runtime.closeConnection(input.connectionId);
    const builtIn = builtInConnection(connection.preset);
    const wakes = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const removed = builtIn
            ? await builtIn.beforeDelete(tx, {
                  connectionId: input.connectionId,
                  now: new Date(),
                  serverId: input.serverId,
              })
            : [];
        await tx
            .delete(mcpConnectionsTable)
            .where(
                and(
                    eq(mcpConnectionsTable.serverId, input.serverId),
                    eq(mcpConnectionsTable.id, input.connectionId)
                )
            );
        return removed;
    });
    if (wakes.length > 0) {
        wake(wakes);
    }
    return shapeMcpConnection(connection);
}
