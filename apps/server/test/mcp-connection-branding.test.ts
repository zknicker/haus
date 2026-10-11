import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { cacheAnonymousMcpIcons } from '../src/server-mcp/icon-cache.ts';
import { createMcpPresetAccount, resolveMcpPresetIcons } from '../src/server-mcp/presets.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import {
    clearMcpIdentity,
    disconnectMcpConnection,
    refreshMcpConnection,
} from '../src/server-mcp/service.ts';
import { listMcpConnections } from '../src/server-mcp/state.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { registerServerRuntime } from './test-computer-connections.ts';

const effectRuntime = registerServerRuntime();
const icon = { dark: null, light: 'data:image/png;base64,iVBORw0KGgo=' };
let resolutions = 0;
const resolveIcon = cacheAnonymousMcpIcons(async () => {
    resolutions += 1;
    return icon;
});
let harness: HausServerHarness;
let database: HausConnection;
let owner: HausClient;
let runtime: McpRuntime;
let member: { clerkUserId: string; id: string };
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('branding-owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Branding', slug: 'branding' })
    ).id;
    const [user] = await harness.sql`select id from users where clerk_user_id = 'branding-owner'`;
    if (!user?.id) {
        throw new Error('The branding test owner was not saved.');
    }
    member = { clerkUserId: 'branding-owner', id: user.id };
    runtime = new McpRuntime(database.db, effectRuntime, {
        clientFactory: () => Promise.resolve(makeClient('Fulfillment account').client),
    });
});

afterAll(async () => {
    await runtime?.close();
    owner?.close();
    await database?.close();
    await harness?.close();
});

test.each([
    'merchbase-atlas',
    'merchbase-fulfillment',
] as const)('%s keeps its Recommended branding through account lifecycle and legacy reads', async (preset) => {
    const catalog = await resolveMcpPresetIcons(resolveIcon);
    const recommended = catalog.find((entry) => entry.preset === preset)?.icon;
    expect(recommended).toEqual(icon);
    const beforeAdd = resolutions;
    const added = await createMcpPresetAccount(database.db, runtime, resolveIcon, member, {
        name: preset,
        preset,
        serverId,
    });
    expect(added).toMatchObject({ connected: false, icon: recommended, grants: [], tools: [] });
    expect(resolutions).toBe(beforeAdd);
    const input = { connectionId: added.id, serverId };
    expect(await owner.trpc.mcp.list.query({ serverId })).toContainEqual(added);

    const connected = await refreshMcpConnection(database.db, runtime, resolveIcon, member, input);
    expect(connected).toMatchObject({ connected: true, icon: recommended });
    const disconnected = await disconnectMcpConnection(database.db, runtime, member, input);
    expect(disconnected).toMatchObject({ connected: false, accountLabel: null, icon: recommended });
    await clearMcpIdentity(database.db, runtime, serverId, added.id);
    expect(await owner.trpc.mcp.list.query({ serverId })).toContainEqual(
        expect.objectContaining({ id: added.id, icon: recommended, connected: false })
    );

    const refreshed = await refreshMcpConnection(
        database.db,
        runtime,
        async () => null,
        member,
        input
    );
    expect(refreshed.icon).toEqual(recommended);

    await harness.sql`update mcp_connections set icon = null, connected = false where id = ${added.id}`;
    const recovered = await listMcpConnections(database.db, resolveIcon, member, serverId);
    expect(recovered).toContainEqual(
        expect.objectContaining({ id: added.id, icon: recommended, connected: false })
    );
    await owner.trpc.mcp.delete.mutate(input);
});
