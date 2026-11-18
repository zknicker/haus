import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable, mcpSecretsTable } from '../postgres/schema.ts';
import { mcpUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { McpUpstreamError } from './errors.ts';

/**
 * After an upstream failure, marks an OAuth connection `connected: false` when
 * its provider rejected the refresh and its tokens are gone, so Settings shows
 * Sign in required instead of a connection that only Agents find broken.
 *
 * Tokens left in place mean the failure was transient (a network error, an
 * unavailable token endpoint) and the next attempt can recover, so the
 * connection stays connected. Grants are never touched: they stay stored,
 * contribute no tools while the connection is signed out, and apply again
 * once a sign-in completes.
 */
export async function markMcpSignInRequired(
    db: HausDatabase,
    connectionId: string,
    cause: unknown
): Promise<void> {
    if (!(cause instanceof McpUpstreamError && cause.code === 'MCP_AUTH_REQUIRED')) {
        return;
    }
    const [connection] = await db
        .select({ serverId: mcpConnectionsTable.serverId })
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.id, connectionId))
        .limit(1);
    if (!connection) {
        return;
    }
    const updated = await db.transaction(async (tx) => {
        // `connected` gates GitHub Trigger fires, which commit behind this lock.
        await lockServerRow(tx, connection.serverId);
        // One statement, so a sign-in that saves new tokens meanwhile always wins.
        return await tx
            .update(mcpConnectionsTable)
            .set({ connected: false })
            .where(
                and(
                    eq(mcpConnectionsTable.id, connectionId),
                    eq(mcpConnectionsTable.auth, 'oauth'),
                    eq(mcpConnectionsTable.connected, true),
                    sql`not exists (
                        select 1 from ${mcpSecretsTable}
                        where ${mcpSecretsTable.connectionId} = ${connectionId}
                          and jsonb_typeof(${mcpSecretsTable.secret} -> 'tokens') = 'object'
                    )`
                )
            )
            .returning({ serverId: mcpConnectionsTable.serverId });
    });
    if (updated.length > 0) {
        mcpUpdatedTopic.announce({ serverId: connection.serverId });
    }
}
