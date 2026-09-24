import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { EffectRuntime, TraceCarrier } from '@haus/effect';
import { and, eq } from 'drizzle-orm';
import { clearAmazonProductCache } from '../amazon-products/read-products.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    mcpConnectionsTable,
    mcpSecretsTable,
} from '../postgres/schema.ts';
import { type ClientFactory, McpClientCache } from './client-cache.ts';
import { asMcpArguments, McpDeniedError } from './errors.ts';
import { createMcpOAuthProvider } from './oauth.ts';
import { secureMcpFetch } from './secure-fetch.ts';
import { listAllTools, modelToolName } from './tool-catalog.ts';
import { narrowMcpToolResult } from './tool-result.ts';
import { runMcpUpstream } from './upstream-operation.ts';

const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;
const DEFAULT_INVOCATION_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5000;

export interface McpSecret {
    approvedAuthorizationServerOrigins: string[];
    authorizationServerInformation?: Record<string, unknown>;
    clientInformation?: Record<string, unknown>;
    configuredClientInformation?: Record<string, unknown>;
    headers: Record<string, string>;
    oauthScopes: string[];
    oauthState?: string;
    redirectUrl?: string;
    tokens?: Record<string, unknown>;
    verifier?: string;
}
export interface McpToolDefinition {
    description: string;
    inputSchema: Record<string, unknown>;
    name: string;
    title: string | null;
}
interface McpRuntimeOptions {
    clientFactory?: ClientFactory;
    closeTimeoutMs?: number;
    discoveryTimeoutMs?: number;
    invocationTimeoutMs?: number;
}
export class McpRuntime {
    private readonly clients: McpClientCache;
    private readonly closeTimeoutMs: number;
    private readonly discoveryTimeoutMs: number;
    private readonly invocationTimeoutMs: number;
    constructor(
        private readonly db: HausDatabase,
        runtime: EffectRuntime<never>,
        options: McpRuntimeOptions = {}
    ) {
        this.closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
        this.discoveryTimeoutMs = options.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
        this.invocationTimeoutMs = options.invocationTimeoutMs ?? DEFAULT_INVOCATION_TIMEOUT_MS;
        this.clients = new McpClientCache(
            runtime,
            options.clientFactory ??
                ((connectionId, signal) => this.createClient(connectionId, signal))
        );
    }
    async discover(connectionId: string) {
        return await this.runUpstream(connectionId, 'discovery', async (client, signal) => {
            const definitions = await listAllTools(client, {
                signal,
                timeout: this.discoveryTimeoutMs,
            });
            return {
                accountLabel: client.serverInfo.name,
                instructions: client.instructions,
                serverInfoIcons: (client.serverInfo as { icons?: unknown }).icons,
                tools: definitions.map((tool) => tool.name),
            };
        });
    }
    async listAgentTools(
        serverId: string,
        agentId: string,
        traceContext?: TraceCarrier,
        signal?: AbortSignal
    ): Promise<McpToolDefinition[]> {
        const connections = await this.grantedConnections(serverId, agentId);
        const definitions = await Promise.all(
            connections.map(async (connection) => {
                try {
                    const tools = await this.runUpstream(
                        connection.id,
                        'discovery',
                        (client, signal) =>
                            listAllTools(client, {
                                signal,
                                timeout: this.discoveryTimeoutMs,
                            }),
                        traceContext,
                        signal
                    );
                    await this.requireGrant(serverId, agentId, connection.id);
                    return tools.map((tool) => ({
                        description: `${connection.name}: ${tool.description ?? `Run ${tool.name}.`}`,
                        inputSchema: tool.inputSchema as Record<string, unknown>,
                        name: modelToolName(connection.id, tool.name),
                        title: tool.annotations?.title ?? null,
                    }));
                } catch {
                    signal?.throwIfAborted();
                    return [];
                }
            })
        );
        return definitions.flat();
    }
    async invoke(input: {
        agentId: string;
        args: unknown;
        serverId: string;
        toolName: string;
        traceContext?: TraceCarrier;
        signal?: AbortSignal;
    }): Promise<unknown> {
        const resolved = await this.resolveGrantedTool(
            input.serverId,
            input.agentId,
            input.toolName
        );
        await this.requireGrant(input.serverId, input.agentId, resolved.connectionId);
        return narrowMcpToolResult(
            await this.runUpstream(
                resolved.connectionId,
                'invocation',
                (client, signal) =>
                    client.callTool({
                        arguments: asMcpArguments(input.args),
                        name: resolved.upstreamName,
                        options: { signal, timeout: this.invocationTimeoutMs },
                    }),
                input.traceContext,
                input.signal
            )
        );
    }
    async closeConnection(connectionId: string): Promise<void> {
        clearAmazonProductCache(this);
        await this.clients.closeConnection(connectionId, this.closeTimeoutMs);
    }
    /** Server product readers authorize membership and select a connected account before calling. */
    async readAmazonProducts(
        connectionId: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        return await this.runUpstream(connectionId, 'invocation', (client, signal) =>
            client.callTool({
                name: 'rankwrangler_product',
                arguments: args,
                options: { signal, timeout: this.invocationTimeoutMs },
            })
        );
    }
    async close(): Promise<void> {
        await this.clients.closeAll(this.closeTimeoutMs);
    }
    async readConnection(connectionId: string) {
        const [connection] = await this.db
            .select()
            .from(mcpConnectionsTable)
            .where(eq(mcpConnectionsTable.id, connectionId))
            .limit(1);
        if (!connection) {
            throw new Error('MCP connection was not found.');
        }
        return connection;
    }
    async readSecret(connectionId: string): Promise<McpSecret> {
        const [row] = await this.db
            .select({ secret: mcpSecretsTable.secret })
            .from(mcpSecretsTable)
            .where(eq(mcpSecretsTable.connectionId, connectionId))
            .limit(1);
        return (row?.secret as unknown as McpSecret | undefined) ?? emptySecret();
    }
    async writeSecret(connectionId: string, secret: McpSecret): Promise<void> {
        await this.db
            .insert(mcpSecretsTable)
            .values({ connectionId, secret: secret as unknown as Record<string, unknown> })
            .onConflictDoUpdate({
                set: {
                    secret: secret as unknown as Record<string, unknown>,
                    updatedAt: new Date(),
                },
                target: mcpSecretsTable.connectionId,
            });
    }
    private async createClient(connectionId: string, signal: AbortSignal): Promise<MCPClient> {
        const connection = await this.readConnection(connectionId);
        const secret = await this.readSecret(connectionId);
        return await createMCPClient({
            clientName: 'Haus Server',
            initializationOptions: { signal },
            transport: {
                authProvider:
                    connection.auth === 'oauth'
                        ? await createMcpOAuthProvider(
                              this,
                              connectionId,
                              secret.redirectUrl ?? 'http://127.0.0.1/mcp/oauth/callback',
                              {
                                  allowAuthorizationServerOrigin: false,
                                  onRedirect() {
                                      throw new Error('Reconnect this MCP server in Haus.');
                                  },
                              }
                          )
                        : undefined,
                fetch: secureMcpFetch,
                headers: secret.headers,
                redirect: 'error',
                type: 'http',
                url: connection.url,
            },
        });
    }
    private async grantedConnections(serverId: string, agentId: string) {
        return await this.db
            .select({
                id: mcpConnectionsTable.id,
                name: mcpConnectionsTable.name,
                tools: mcpConnectionsTable.tools,
            })
            .from(agentMcpConnectionGrantsTable)
            .innerJoin(
                mcpConnectionsTable,
                and(
                    eq(mcpConnectionsTable.serverId, agentMcpConnectionGrantsTable.serverId),
                    eq(mcpConnectionsTable.id, agentMcpConnectionGrantsTable.connectionId)
                )
            )
            .where(
                and(
                    eq(agentMcpConnectionGrantsTable.serverId, serverId),
                    eq(agentMcpConnectionGrantsTable.agentId, agentId),
                    eq(mcpConnectionsTable.connected, true)
                )
            );
    }
    private async requireGrant(serverId: string, agentId: string, connectionId: string) {
        const [grant] = await this.db
            .select({ connectionId: agentMcpConnectionGrantsTable.connectionId })
            .from(agentMcpConnectionGrantsTable)
            .where(
                and(
                    eq(agentMcpConnectionGrantsTable.serverId, serverId),
                    eq(agentMcpConnectionGrantsTable.agentId, agentId),
                    eq(agentMcpConnectionGrantsTable.connectionId, connectionId)
                )
            )
            .limit(1);
        if (!grant) {
            throw new McpDeniedError('Access to this MCP connection was revoked.');
        }
    }
    private async resolveGrantedTool(serverId: string, agentId: string, visibleName: string) {
        const connections = await this.grantedConnections(serverId, agentId);
        for (const connection of connections) {
            const upstreamName = connection.tools.find(
                (toolName) => modelToolName(connection.id, toolName) === visibleName
            );
            if (upstreamName) {
                return { connectionId: connection.id, upstreamName };
            }
        }
        throw new McpDeniedError(`MCP tool ${visibleName} is not granted.`);
    }
    private async runUpstream<T>(
        connectionId: string,
        operation: 'discovery' | 'invocation',
        use: (client: MCPClient, signal: AbortSignal) => Promise<T>,
        traceContext?: TraceCarrier,
        signal?: AbortSignal
    ): Promise<T> {
        return await runMcpUpstream({
            clients: this.clients,
            signal,
            connectionId,
            operation,
            traceContext,
            timeoutMs:
                operation === 'discovery' ? this.discoveryTimeoutMs : this.invocationTimeoutMs,
            use,
        });
    }
}

export function emptySecret(): McpSecret {
    return { approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] };
}
