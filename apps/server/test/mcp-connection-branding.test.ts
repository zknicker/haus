import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { mcpUpdatedTopic } from '../src/realtime/topics.ts';
import { clearMcpIdentity } from '../src/server-mcp/connection-identity.ts';
import { cacheAnonymousMcpIcons } from '../src/server-mcp/icon-cache.ts';
import { repairMcpConnectionIcons } from '../src/server-mcp/icon-repair.ts';
import { createMcpPresetAccount, resolveMcpPresetIcons } from '../src/server-mcp/presets.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { disconnectMcpConnection, refreshMcpConnection } from '../src/server-mcp/service.ts';
import { listMcpConnections } from '../src/server-mcp/state.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const effectRuntime = makeServerRuntime();
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
let member: { subject: string; id: string };
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('branding-owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Branding', slug: 'branding' })
    ).id;
    const [user] = await harness.sql`select id from users where auth_subject = 'branding-owner'`;
    if (!user?.id) {
        throw new Error('The branding test owner was not saved.');
    }
    member = { subject: 'branding-owner', id: user.id };
    runtime = new McpRuntime(database.db, effectRuntime, {
        clientFactory: () => Promise.resolve(makeClient('Fulfillment account').client),
    });
});

afterAll(async () => {
    await runtime?.close();
    await effectRuntime.dispose();
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

    // A row stored without branding stays a pure read: no lookup, no recovery on list.
    await harness.sql`update mcp_connections set icon = null, connected = false where id = ${added.id}`;
    const beforeList = resolutions;
    expect(await listMcpConnections(database.db, member, serverId)).toContainEqual(
        expect.objectContaining({ id: added.id, icon: null, connected: false })
    );
    expect(resolutions).toBe(beforeList);

    // The startup repair restores it and tells the App's update stream.
    const updates = mcpUpdatedTopic.subscribe();
    const announced = updates.next();
    expect((await repairMcpConnectionIcons(database.db, resolveIcon)).repaired).toBe(1);
    expect((await announced).value?.event).toEqual({ serverId });
    await updates.return(undefined);
    expect(await listMcpConnections(database.db, member, serverId)).toContainEqual(
        expect.objectContaining({ id: added.id, icon: recommended, connected: false })
    );
    await owner.trpc.mcp.delete.mutate(input);
});

test('listing connections never resolves icons, even for rows missing branding', async () => {
    const added = await createMcpPresetAccount(database.db, runtime, resolveIcon, member, {
        name: 'Cloudflare',
        preset: 'cloudflare',
        serverId,
    });
    await harness.sql`update mcp_connections set icon = '{"light":"not-an-image"}'::jsonb where id = ${added.id}`;
    // The harness Server resolves through the real fetch; any branding lookup lands here.
    const realFetch = globalThis.fetch;
    const brandingFetches: string[] = [];
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((request, init) => {
        const url = request instanceof Request ? request.url : String(request);
        if (new URL(url).hostname.endsWith('cloudflare.com')) {
            brandingFetches.push(url);
            return Promise.resolve(new Response(null, { status: 404 }));
        }
        return realFetch(request, init);
    });
    try {
        const listed = await owner.trpc.mcp.list.query({ serverId });
        expect(listed.find((row) => row.id === added.id)?.icon).toBeNull();
    } finally {
        fetchSpy.mockRestore();
    }
    expect(brandingFetches).toEqual([]);
    await owner.trpc.mcp.delete.mutate({ connectionId: added.id, serverId });
});
