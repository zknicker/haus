import type { McpConnection } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { tombstoneGithubInstallations } from '../github/installation-removal.ts';
import { problemWakes } from '../github/trigger-problems.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireOperableConnection } from './connection-access.ts';
import type { McpRuntime } from './runtime.ts';
import { shapeMcpConnection } from './state.ts';

/**
 * Deletes a connection and, with it, its secret and Agent grants. A GitHub
 * connection first tombstones its installations and degrades their Triggers
 * in the same transaction (specs/github-app-connection.md#removal-and-deletion);
 * `wake` dispatches the notified owners after commit.
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
    const entered = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const removed =
            connection.preset === 'github'
                ? await tombstoneGithubInstallations(tx, {
                      now: new Date(),
                      scope: { connectionId: input.connectionId },
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
    if (entered.length > 0) {
        wake(problemWakes(input.serverId, entered));
    }
    return shapeMcpConnection(connection);
}
