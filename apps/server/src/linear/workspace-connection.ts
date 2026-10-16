import type { McpIcon } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { linearHostedUrl } from '../hosted-mcp/catalog.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { mcpConnectionsTable, mcpSecretsTable } from '../postgres/schema.ts';
import { emptySecret } from '../server-mcp/connection-secret.ts';

// The MCP connection row a Linear workspace binding owns. Its icon is resolved
// by the caller before the binding transaction, so nothing here fetches.

// Named for the service like every preset; the unique URL key is the account.
const linearName = 'Linear';

export async function insertLinearConnection(
    tx: HausDatabase,
    input: { accountLabel: string; icon: McpIcon | null; serverId: string }
): Promise<string> {
    const connectionId = createOpaqueId('mcp');
    await tx.insert(mcpConnectionsTable).values({
        accountLabel: input.accountLabel,
        auth: 'none',
        connected: true,
        headerNames: [],
        icon: input.icon,
        id: connectionId,
        name: linearName,
        preset: 'linear',
        serverId: input.serverId,
        tools: [],
        url: linearHostedUrl,
    });
    await tx.insert(mcpSecretsTable).values({
        connectionId,
        secret: emptySecret() as unknown as Record<string, unknown>,
    });
    return connectionId;
}

/** A reconnect fills a missing icon; an existing one is service branding and stays. */
export async function reconnectLinearConnection(
    tx: HausDatabase,
    input: { accountLabel: string; connectionId: string; icon: McpIcon | null }
) {
    await tx
        .update(mcpConnectionsTable)
        .set({ accountLabel: input.accountLabel, connected: true, name: linearName })
        .where(eq(mcpConnectionsTable.id, input.connectionId));
    if (input.icon) {
        await tx
            .update(mcpConnectionsTable)
            .set({ icon: input.icon })
            .where(
                and(
                    eq(mcpConnectionsTable.id, input.connectionId),
                    isNull(mcpConnectionsTable.icon)
                )
            );
    }
}
