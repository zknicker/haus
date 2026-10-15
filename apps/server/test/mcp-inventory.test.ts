import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    mcpConnectionsTable,
    serversTable,
} from '../src/postgres/schema.ts';
import { emptySecret } from '../src/server-mcp/connection-secret.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { modelToolName } from '../src/server-mcp/tool-catalog.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { startControlledToolMcp } from './controlled-tool-mcp.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const effectRuntime = makeServerRuntime();
const serverId = 'srv_inventory';
const agentId = 'agt_inventory';
let cluster: PostgresCluster;
let connection: HausConnection;
const runtimes: McpRuntime[] = [];
const upstreams: ReturnType<typeof startControlledToolMcp>[] = [];

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    await connection.db
        .insert(serversTable)
        .values({ id: serverId, displayName: 'Inventory', slug: 'inventory' });
    await connection.db.insert(agentsTable).values({
        id: agentId,
        serverId,
        displayName: 'Inventory',
        handle: 'inventory',
        homeTimezone: 'UTC',
    });
});
afterAll(async () => {
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    await Promise.all(upstreams.map((upstream) => upstream.stop()));
    await effectRuntime.dispose();
    await connection?.close();
    await cluster?.stop();
});

test('notifications add, remove, and clear tools without Agent activity or grants', async () => {
    const { runtime, upstream, id } = await setup(true);
    await runtime.start();
    await until(async () => upstream.subscribed() && (await names(id)).join() === 'echo');
    upstream.replace(['actions_run']);
    upstream.notify();
    await until(async () => (await names(id)).join() === 'actions_run');
    await grant(id);
    const before = upstream.lists();
    expect((await runtime.listAgentTools(serverId, agentId)).map((tool) => tool.name)).toEqual([
        modelToolName(id, 'actions_run'),
    ]);
    expect(upstream.lists()).toBe(before);
    await expect(
        runtime.invoke({ agentId, serverId, args: {}, toolName: modelToolName(id, 'actions_run') })
    ).resolves.toMatchObject({ content: [{ text: 'ok', type: 'text' }] });
    upstream.replace([]);
    upstream.notify();
    await until(async () => (await names(id)).length === 0);
    expect(await runtime.listAgentTools(serverId, agentId)).toEqual([]);
    await runtime.close();
});

test('legacy list-changed notifications also refresh without Agent activity', async () => {
    const { runtime, upstream, id } = await setup(false, undefined, true);
    await runtime.start();
    await until(async () => upstream.subscribed());
    upstream.replace(['legacy_added']);
    upstream.notify();
    await until(async () => (await names(id)).join() === 'legacy_added');
    await runtime.close();
});

test('renews an ended notification stream and discovers changes missed while offline', async () => {
    const { runtime, upstream, id } = await setup(true);
    await runtime.start();
    await until(async () => upstream.subscribed());
    upstream.endStreams();
    upstream.replace(['missed_tool']);
    await until(async () => (await names(id)).join() === 'missed_tool', 8000);
    expect(upstream.subscribed()).toBe(true);
    await runtime.close();
}, 10_000);

test('background reconciliation updates legacy servers; failures retain the last inventory', async () => {
    const { runtime, upstream, id } = await setup(false, 100);
    await runtime.start();
    upstream.replace(['new_tool']);
    await until(async () => (await names(id)).join() === 'new_tool');
    upstream.fail(true);
    await expect(runtime.inventory.refresh(id)).rejects.toMatchObject({ code: 'MCP_UNAVAILABLE' });
    expect(await names(id)).toEqual(['new_tool']);
    await runtime.close();
});

test('revocation during discovery prevents dispatch, and denial names the connection', async () => {
    const { runtime, upstream, id } = await setup(false);
    await grant(id);
    const waiting = Promise.withResolvers<void>();
    upstream.wait(waiting.promise);
    const result = runtime
        .invoke({ agentId, serverId, args: {}, toolName: modelToolName(id, 'echo') })
        .catch((cause) => cause);
    await until(async () => upstream.lists() > 0);
    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(eq(agentMcpConnectionGrantsTable.connectionId, id));
    waiting.resolve();
    expect(await result).toMatchObject({
        code: 'MCP_DENIED',
        message: expect.stringContaining('Server Owner or Admin'),
    });
    expect(upstream.calls).toEqual([]);
    await runtime.close();
});

async function setup(modern: boolean, inventoryIntervalMs?: number, notifications?: boolean) {
    const upstream = startControlledToolMcp(modern, notifications);
    upstreams.push(upstream);
    const id = `mcp_${crypto.randomUUID().slice(0, 16)}`;
    await connection.db.insert(mcpConnectionsTable).values({
        id,
        serverId,
        name: 'Fixture',
        url: upstream.url,
        auth: 'none',
        connected: true,
        headerNames: [],
        tools: ['stale_tool'],
    });
    const runtime = new McpRuntime(connection.db, effectRuntime, { inventoryIntervalMs });
    runtimes.push(runtime);
    await runtime.writeSecret(id, emptySecret());
    return { id, runtime, upstream };
}
async function grant(connectionId: string) {
    await connection.db
        .insert(agentMcpConnectionGrantsTable)
        .values({ agentId, serverId, connectionId });
}
async function names(id: string): Promise<string[]> {
    const [row] = await connection.db
        .select({ tools: mcpConnectionsTable.tools })
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.id, id));
    return row?.tools ?? [];
}
async function until(condition: () => Promise<boolean>, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) {
            return;
        }
        await Bun.sleep(10);
    }
    throw new Error('The MCP inventory did not converge.');
}
