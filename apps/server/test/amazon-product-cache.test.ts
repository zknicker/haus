import { expect, test } from 'bun:test';
import { readAmazonProducts } from '../src/amazon-products/read-products.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { findUserByClerkId } from '../src/users/haus-user.ts';
import { createHausClient } from './haus-client.ts';
import { startHausServerHarness } from './haus-server-harness.ts';

test('product cache shares lookups and rechecks connection state before serving cached data', async () => {
    const harness = await startHausServerHarness();
    const db = await connectHausDatabase(harness.databaseUrl);
    const effects = makeServerRuntime();
    const client = createHausClient(harness, await harness.clerk.mintSessionToken('product-cache'));
    let reads = 0;
    const upstream = makeClient('RankWrangler', {
        call: async (args) => {
            expect(args).toMatchObject({
                arguments: {
                    operation: 'get',
                    asin: 'B07XN9T11R',
                    marketplaceId: 'ATVPDKIKX0DER',
                    include: ['shortName', 'cutoutThumbnail'],
                },
            });
            reads += 1;
            return {
                structuredContent: {
                    operation: 'get',
                    data: {
                        asin: 'B07XN9T11R',
                        marketplaceId: 'ATVPDKIKX0DER',
                        listing: {
                            title: 'Freaky Lunch Lady Halloween Shirt',
                            shortName: 'Freaky Lunch Lady',
                            cutoutThumbnail: {
                                status: 'available',
                                url: 'https://images.example.com/cutout.webp',
                            },
                            thumbnail: { status: 'unavailable' },
                            amazonListingStatus: 'active',
                            bulletPoints: [],
                        },
                        price: null,
                    },
                },
            };
        },
    });
    const runtime = new McpRuntime(db.db, effects, { clientFactory: async () => upstream.client });
    try {
        const server = await client.trpc.server.create.mutate({
            displayName: 'Products',
            slug: 'product-cache',
        });
        const account = await client.trpc.mcp.addPresetAccount.mutate({
            serverId: server.id,
            preset: 'rankwrangler',
            name: 'RankWrangler',
        });
        const member = await findUserByClerkId(db.db, 'product-cache');
        const input = {
            serverId: server.id,
            detail: false,
            products: [{ asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' as const }],
        };
        expect(await readAmazonProducts(db.db, runtime, member, input)).toBeNull();
        await harness.sql`update mcp_connections set connected = true, tools = ARRAY['rankwrangler_product'] where id = ${account.id}`;
        const results = await Promise.all([
            readAmazonProducts(db.db, runtime, member, input),
            readAmazonProducts(db.db, runtime, member, input),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect(reads).toBe(1);
        expect(results[0]?.[0]?.cutoutThumbnail).toEqual({
            status: 'available',
            url: 'https://images.example.com/cutout.webp',
        });
        await harness.sql`update mcp_connections set connected = false where id = ${account.id}`;
        expect(await readAmazonProducts(db.db, runtime, member, input)).toBeNull();
        await runtime.closeConnection(account.id);
        await harness.sql`update mcp_connections set connected = true where id = ${account.id}`;
        await readAmazonProducts(db.db, runtime, member, input);
        expect(reads).toBe(2);
        await expect(readAmazonProducts(db.db, runtime, null, input)).rejects.toThrow();
    } finally {
        await runtime.close();
        await effects.dispose();
        client.close();
        await db.close();
        await harness.close();
    }
});
