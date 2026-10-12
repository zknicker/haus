import type { McpPreset } from '@haus/api';
import type { EffectRuntime, TraceCarrier } from '@haus/effect';
import type { Client as MCPClient } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { Effect, type Scope } from 'effect';
import { clearAmazonProductCache } from '../amazon-products/read-products.ts';
import type { HostedMcpAccess } from '../hosted-mcp/supervisor.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable, mcpSecretsTable } from '../postgres/schema.ts';
import { resolveAccountLabel } from './account-label.ts';
import {
    authorizeToolConnection,
    hasConnectionGrant,
    missingGrantMessage,
    readGrantedConnections,
    toolNotOffered,
} from './agent-access.ts';
import { type ClientFactory, McpClientCache } from './client-cache.ts';
import { createConnectionClient } from './connection-client.ts';
import { asMcpArguments, McpDeniedError } from './errors.ts';
import { McpInventory } from './inventory.ts';
import { callMcpTool, listAllTools, modelToolName } from './tool-catalog.ts';
import { narrowMcpToolResult } from './tool-result.ts';
import { classifyMcpUpstreamError } from './upstream-failure.ts';
import { runMcpUpstream } from './upstream-operation.ts';

const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;
const DEFAULT_INVOCATION_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5000;

export interface McpSecret {
    approvedAuthorizationServerOrigins: string[];
    clientInformation?: Record<string, unknown>;
    clientInformationIssuer?: string;
    configuredClientInformation?: Record<string, unknown>;
    discoveryState?: Record<string, unknown>;
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
    hostedMcps?: HostedMcpAccess;
    inventoryIntervalMs?: number;
    invocationTimeoutMs?: number;
}
export class McpRuntime {
    readonly inventory: McpInventory;
    readonly hostedMcps: HostedMcpAccess | undefined;
    private readonly clients: McpClientCache;
    private readonly closeTimeoutMs: number;
    private readonly discoveryTimeoutMs: number;
    private readonly invocationTimeoutMs: number;
    constructor(
        private readonly db: HausDatabase,
        private readonly runtime: EffectRuntime<never>,
        options: McpRuntimeOptions = {}
    ) {
        this.hostedMcps = options.hostedMcps;
        this.closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
        this.discoveryTimeoutMs = options.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
        this.invocationTimeoutMs = options.invocationTimeoutMs ?? DEFAULT_INVOCATION_TIMEOUT_MS;
        this.inventory = new McpInventory(
            db,
            (id) =>
                this.runUpstream(id, 'discovery', (client, signal) =>
                    listAllTools(client, {
                        signal,
                        timeout: this.discoveryTimeoutMs,
                        cacheMode: 'refresh',
                    })
                ),
            (id, cause) => this.inventoryFailed(id, cause),
            runtime,
            options.inventoryIntervalMs
        );
        this.clients = new McpClientCache(
            runtime,
            options.clientFactory ??
                ((connectionId, signal, scope) => this.createClient(connectionId, signal, scope))
        );
    }
    async discover(connectionId: string, preset: McpPreset | null = null) {
        return await this.runUpstream(connectionId, 'discovery', async (client, signal) => {
            const timeout = this.discoveryTimeoutMs;
            const definitions = await listAllTools(client, { signal, timeout });
            const tools = definitions.map((tool) => tool.name);
            return {
                accountLabel: await resolveAccountLabel(client, { preset, signal, timeout, tools }),
                definitions,
                instructions: client.getInstructions(),
                serverInfoIcons: client.getServerVersion()?.icons,
                tools,
            };
        });
    }
    async listAgentTools(
        serverId: string,
        agentId: string,
        _traceContext?: TraceCarrier,
        signal?: AbortSignal
    ): Promise<McpToolDefinition[]> {
        signal?.throwIfAborted();
        const scope = { serverId, agentId };
        const connections = await readGrantedConnections(this.db, scope);
        const definitions = await Promise.all(
            connections.map(async (connection) => {
                if (!(await hasConnectionGrant(this.db, scope, connection.id))) {
                    return [];
                }
                return this.inventory.read(connection.id).map((tool) => ({
                    description: `${connection.name}: ${tool.description ?? `Run ${tool.name}.`}`,
                    inputSchema: tool.inputSchema,
                    name: modelToolName(connection.id, tool.name),
                    title: tool.annotations?.title ?? null,
                }));
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
        const args = asMcpArguments(input.args);
        const scope = { serverId: input.serverId, agentId: input.agentId };
        const connection = await authorizeToolConnection(this.db, scope, input.toolName);
        const outcome = await this.runUpstream(
            connection.id,
            'invocation',
            async (client, signal) => {
                let tools = await listAllTools(client, {
                    signal,
                    timeout: this.invocationTimeoutMs,
                });
                let tool = tools.find(
                    (item) => modelToolName(connection.id, item.name) === input.toolName
                );
                if (!tool) {
                    tools = (
                        await client.listTools(undefined, {
                            signal,
                            timeout: this.invocationTimeoutMs,
                            cacheMode: 'refresh',
                        })
                    ).tools;
                    tool = tools.find(
                        (item) => modelToolName(connection.id, item.name) === input.toolName
                    );
                }
                if (!tool) {
                    return { kind: 'absent' } as const;
                }
                if (!(await hasConnectionGrant(this.db, scope, connection.id))) {
                    return { kind: 'revoked' } as const;
                }
                signal.throwIfAborted();
                return {
                    kind: 'called',
                    result: await callMcpTool(client, {
                        arguments: args,
                        name: tool.name,
                        definition: tool,
                        options: { signal, timeout: this.invocationTimeoutMs },
                    }),
                } as const;
            },
            input.traceContext,
            input.signal
        );
        if (outcome.kind === 'absent') {
            throw toolNotOffered(connection, input.toolName);
        }
        if (outcome.kind === 'revoked') {
            throw new McpDeniedError(missingGrantMessage(connection.name));
        }
        return narrowMcpToolResult(outcome.result);
    }
    async closeConnection(connectionId: string): Promise<void> {
        this.inventory.forget(connectionId);
        clearAmazonProductCache(this);
        await this.clients.closeConnection(connectionId, this.closeTimeoutMs);
    }
    /** Server product readers authorize membership and select a connected account before calling. */
    async readAmazonProducts(
        connectionId: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        return await this.runUpstream(connectionId, 'invocation', (client, signal) =>
            callMcpTool(client, {
                name: 'rankwrangler_product',
                arguments: args,
                options: { signal, timeout: this.invocationTimeoutMs },
            })
        );
    }
    async close(): Promise<void> {
        await this.inventory.close();
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
    ownsClient(connectionId: string, client: MCPClient): boolean {
        return this.clients.owns(connectionId, client);
    }
    private createClient(
        connectionId: string,
        signal: AbortSignal,
        scope: Scope.CloseableScope
    ): Promise<MCPClient> {
        return createConnectionClient(this, connectionId, signal, { runtime: this.runtime, scope });
    }
    start(): Promise<void> {
        return this.inventory.start();
    }
    inventoryFailed(connectionId: string, cause: unknown): void {
        const failure = classifyMcpUpstreamError(cause, 'discovery');
        this.runtime.runSync(
            Effect.logWarning(
                'MCP inventory refresh failed; retaining the last successful catalog'
            ).pipe(
                Effect.annotateLogs({
                    connectionId,
                    operation: 'mcp.inventory',
                    failureKind: failure.failureKind,
                    code: failure.code,
                })
            )
        );
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
