import { expect, test } from 'bun:test';
import { readAmazonProductSummary } from '../src/amazon-products/read-products.ts';
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
    const unknownAsin = 'B000000000';
    const upstream = makeClient('RankWrangler', {
        call: async (args) => {
            const request = args.arguments as Record<string, unknown>;
            expect(request).toMatchObject({
                operation: 'get',
                marketplaceId: 'ATVPDKIKX0DER',
                include: ['shortName', 'cutoutThumbnail'],
            });
            reads += 1;
            if (request.asin !== 'B07XN9T11R') {
                return {
                    isError: true,
                    structuredContent: { error: { code: 'NOT_FOUND', retryable: false } },
                };
            }
            return {
                structuredContent: {
                    operation: 'get',
                    data: {
                        asin: 'B07XN9T11R',
                        marketplaceId: 'ATVPDKIKX0DER',
                        listing: {
                            title: 'Freaky Lunch Lady Halloween Shirt',
                            brand: 'Halloween by 14th Floor',
                            shortName: 'Freaky Lunch Lady',
                            cutoutThumbnail: {
                                status: 'available',
                                url: 'https://images.example.com/cutout.webp',
                            },
                            thumbnail: { status: 'unavailable' },
                            amazonListingStatus: 'active',
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
            product: { asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' as const },
        };
        expect(await readAmazonProductSummary(db.db, runtime, member, input)).toBeNull();
        await harness.sql`update mcp_connections set connected = true, tools = ARRAY['rankwrangler_product'] where id = ${account.id}`;
        const results = await Promise.all([
            readAmazonProductSummary(db.db, runtime, member, input),
            readAmazonProductSummary(db.db, runtime, member, input),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect(reads).toBe(1);
        expect(results[0]).toMatchObject({
            status: 'found',
            product: {
                shortName: 'Freaky Lunch Lady',
                brand: 'Halloween by 14th Floor',
                cutoutThumbnail: {
                    status: 'available',
                    url: 'https://images.example.com/cutout.webp',
                },
            },
        });
        await readAmazonProductSummary(db.db, runtime, member, input);
        expect(reads).toBe(1);
        await harness.sql`update mcp_connections set connected = false where id = ${account.id}`;
        expect(await readAmazonProductSummary(db.db, runtime, member, input)).toBeNull();
        await runtime.closeConnection(account.id);
        await harness.sql`update mcp_connections set connected = true where id = ${account.id}`;
        await readAmazonProductSummary(db.db, runtime, member, input);
        expect(reads).toBe(2);
        const unknown = {
            ...input,
            product: { asin: unknownAsin, marketplaceId: 'ATVPDKIKX0DER' as const },
        };
        expect(await readAmazonProductSummary(db.db, runtime, member, unknown)).toEqual({
            ...unknown.product,
            status: 'unavailable',
        });
        // Misses are not cached.
        await readAmazonProductSummary(db.db, runtime, member, unknown);
        expect(reads).toBe(4);
        await expect(readAmazonProductSummary(db.db, runtime, null, input)).rejects.toThrow();
    } finally {
        await runtime.close();
        await effects.dispose();
        client.close();
        await db.close();
        await harness.close();
    }
});
