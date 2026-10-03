import {
    isMcpBearerTokenPreset,
    type McpConnection,
    type McpConnectionCreate,
    type McpOAuthStart,
    type McpOAuthStartResult,
    type McpPreset,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentMcpConnectionGrantsTable,
    mcpConnectionsTable,
    mcpSecretsTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireAdmin, requireConnection, requireOperableConnection } from './connection-access.ts';
import { McpDeniedError } from './errors.ts';
import type { McpIconResolver } from './icons.ts';
import { summarizeInstructions } from './instructions-summary.ts';
import type { McpOAuthRelay } from './oauth-relay.ts';
import { emptySecret, type McpRuntime } from './runtime.ts';
import { shapeMcpConnection } from './state.ts';

export async function createMcpConnection(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: McpConnectionCreate,
    preset: McpPreset | null = null
): Promise<McpConnection> {
    await requireAdmin(db, member, input.serverId, 'add a connection');
    const id = createOpaqueId('mcp');
    const shouldConnect =
        input.auth === 'none' ||
        (input.auth === 'headers' && Object.keys(input.headers).length > 0);
    const [row] = await db.transaction(async (tx) => {
        const [connection] = await tx
            .insert(mcpConnectionsTable)
            .values({
                accountLabel: null,
                auth: input.auth,
                connected: false,
                headerNames: Object.keys(input.headers).sort(),
                id,
                name: input.name,
                preset,
                serverId: input.serverId,
                tools: [],
                url: input.url,
            })
            .returning();
        if (!connection) {
            throw new Error('MCP connection was not saved.');
        }
        await tx.insert(mcpSecretsTable).values({
            connectionId: id,
            secret: {
                ...emptySecret(),
                configuredClientInformation: input.oauthClientId
                    ? {
                          client_id: input.oauthClientId,
                          ...(input.oauthClientSecret
                              ? { client_secret: input.oauthClientSecret }
                              : {}),
                      }
                    : undefined,
                headers: input.headers,
                oauthScopes: input.oauthScopes,
            },
        });
        return [connection];
    });
    if (shouldConnect) {
        try {
            return shapeMcpConnection(await refreshInventory(db, runtime, resolveIcon, row));
        } catch (cause) {
            await runtime.closeConnection(id);
            await db.delete(mcpConnectionsTable).where(eq(mcpConnectionsTable.id, id));
            throw cause;
        }
    }
    return shapeMcpConnection(row);
}

export async function startMcpOAuth(
    db: HausDatabase,
    runtime: McpRuntime,
    relay: McpOAuthRelay,
    member: HausUser | null,
    input: McpOAuthStart
): Promise<McpOAuthStartResult> {
    await requireAdmin(db, member, input.serverId, 'connect an account');
    const connection = await requireConnection(db, input);
    if (connection.auth !== 'oauth') {
        throw new McpDeniedError('This OAuth connection was not found.');
    }
    const result = await relay.start({
        allowAuthorizationServerOrigin: input.allowAuthorizationServerOrigin,
        connectionId: input.connectionId,
        redirectUrl: input.redirectUrl,
    });
    if (result.status === 'ready') {
        await clearMcpIdentity(db, runtime, input.serverId, input.connectionId);
    }
    return result;
}

export async function disconnectMcpConnection(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { connectionId: string; serverId: string }
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    await runtime.closeConnection(input.connectionId);
    const secret = await runtime.readSecret(input.connectionId);
    const headerNames = isMcpBearerTokenPreset(connection.preset) ? [] : connection.headerNames;
    await db.transaction(async (tx) => {
        await tx
            .delete(agentMcpConnectionGrantsTable)
            .where(eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId));
        await tx
            .update(mcpSecretsTable)
            .set({
                secret: {
                    ...emptySecret(),
                    approvedAuthorizationServerOrigins: secret.approvedAuthorizationServerOrigins,
                    configuredClientInformation: secret.configuredClientInformation,
                    // A bearer-token preset's token is its account, so it goes too.
                    headers: isMcpBearerTokenPreset(connection.preset) ? {} : secret.headers,
                    oauthScopes: secret.oauthScopes,
                } as unknown as Record<string, unknown>,
                updatedAt: new Date(),
            })
            .where(eq(mcpSecretsTable.connectionId, input.connectionId));
        await tx
            .update(mcpConnectionsTable)
            .set({
                accountLabel: null,
                connected: false,
                headerNames,
                icon: null,
                summary: null,
                tools: [],
            })
            .where(eq(mcpConnectionsTable.id, input.connectionId));
    });
    return shapeMcpConnection({
        ...connection,
        accountLabel: null,
        connected: false,
        headerNames,
        tools: [],
    });
}

export async function deleteMcpConnection(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { connectionId: string; serverId: string }
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    await runtime.closeConnection(input.connectionId);
    await db.delete(mcpConnectionsTable).where(eq(mcpConnectionsTable.id, input.connectionId));
    return shapeMcpConnection(connection);
}

export async function refreshMcpConnection(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: { connectionId: string; serverId: string }
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    return shapeMcpConnection(await refreshInventory(db, runtime, resolveIcon, connection));
}

export async function replaceMcpHeaders(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: { connectionId: string; headers: Record<string, string>; serverId: string }
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    if (connection.auth !== 'headers') {
        throw new McpDeniedError('This MCP connection does not use header credentials.');
    }
    if (isMcpBearerTokenPreset(connection.preset)) {
        throw new McpDeniedError("Replace this connection's token instead of its headers.");
    }
    return await saveMcpHeaders(db, runtime, resolveIcon, connection, input.headers);
}

/** Swaps a header connection's secret headers, clears its Agent access, and rediscovers. */
export async function saveMcpHeaders(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    connection: typeof mcpConnectionsTable.$inferSelect,
    headers: Record<string, string>
): Promise<McpConnection> {
    await runtime.closeConnection(connection.id);
    const secret = await runtime.readSecret(connection.id);
    await runtime.writeSecret(connection.id, { ...secret, headers });
    const updated = await db
        .update(mcpConnectionsTable)
        .set({
            accountLabel: null,
            connected: false,
            headerNames: Object.keys(headers).sort(),
            tools: [],
        })
        .where(eq(mcpConnectionsTable.id, connection.id))
        .returning();
    await db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.connectionId, connection.id));
    const row = updated[0];
    if (!row) {
        throw new Error('MCP headers were not saved.');
    }
    return Object.keys(headers).length > 0
        ? shapeMcpConnection(await refreshInventory(db, runtime, resolveIcon, row))
        : shapeMcpConnection(row);
}

export async function clearMcpIdentity(
    db: HausDatabase,
    runtime: McpRuntime,
    serverId: string,
    connectionId: string
) {
    await runtime.closeConnection(connectionId);
    await db.transaction(async (tx) => {
        await tx
            .delete(agentMcpConnectionGrantsTable)
            .where(eq(agentMcpConnectionGrantsTable.connectionId, connectionId));
        await tx
            .update(mcpConnectionsTable)
            .set({ accountLabel: null, connected: false, icon: null, summary: null, tools: [] })
            .where(
                and(
                    eq(mcpConnectionsTable.serverId, serverId),
                    eq(mcpConnectionsTable.id, connectionId)
                )
            );
    });
}
const iconTimeoutMs = 4000;
async function refreshInventory(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    connection: typeof mcpConnectionsTable.$inferSelect
) {
    await runtime.closeConnection(connection.id);
    const discovery = await runtime.discover(connection.id);
    const icon = await resolveIcon({
        connectionUrl: connection.url,
        serverInfoIcons: discovery.serverInfoIcons,
        timeoutMs: iconTimeoutMs,
    }).catch(() => null);
    const [updated] = await db
        .update(mcpConnectionsTable)
        .set({
            accountLabel: discovery.accountLabel,
            connected: true,
            icon,
            summary: summarizeInstructions(discovery.instructions),
            tools: [...new Set(discovery.tools)].sort(),
        })
        .where(eq(mcpConnectionsTable.id, connection.id))
        .returning();
    if (!updated) {
        throw new Error('MCP inventory was not saved.');
    }
    return updated;
}
