import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    amazonProductDetailSchema,
    amazonProductSummarySchema,
    rankWranglerMcpUrl,
} from '@haus/api';
import { and, arrayContains, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

const caches = new WeakMap<
    McpRuntime,
    Map<string, { expires: number; value: Promise<AmazonProductDetail[]> }>
>();
export function clearAmazonProductCache(runtime: McpRuntime) {
    caches.delete(runtime);
}
const envelopeSchema = z.object({
    isError: z.boolean().optional(),
    structuredContent: z.unknown().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});

export function rankWranglerPayload(result: unknown): unknown {
    const envelope = envelopeSchema.parse(result);
    if (envelope.isError) {
        throw new Error('RankWrangler product lookup failed.');
    }
    if (envelope.structuredContent !== undefined) {
        return envelope.structuredContent;
    }
    const text = envelope.content?.find((block) => block.type === 'text')?.text;
    if (!text) {
        throw new Error('RankWrangler returned no product data.');
    }
    return JSON.parse(text);
}

export function parseProductDetails(result: unknown) {
    const { data } = z
        .object({
            operation: z.literal('get'),
            data: z.object({
                asin: z.string(),
                marketplaceId: z.string(),
                listing: amazonProductSummarySchema.omit({ asin: true, marketplaceId: true }),
                price: amazonProductDetailSchema.shape.price,
            }),
        })
        .parse(rankWranglerPayload(result));
    return amazonProductDetailSchema.parse({
        ...data,
        ...data.listing,
    });
}

export async function readAmazonProducts(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { serverId: string; products: AmazonProductIdentity[]; detail: boolean }
) {
    await requireServerMembership(db, member, input.serverId);
    const [connection] = await db
        .select()
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, input.serverId),
                eq(mcpConnectionsTable.url, rankWranglerMcpUrl),
                arrayContains(mcpConnectionsTable.tools, ['rankwrangler_product']),
                eq(mcpConnectionsTable.connected, true)
            )
        )
        .orderBy(asc(mcpConnectionsTable.id))
        .limit(1);
    if (!connection?.tools.includes('rankwrangler_product')) {
        return null;
    }
    const products = [
        ...new Map(input.products.map((product) => [product.asin, product])).values(),
    ].sort((a, b) => a.asin.localeCompare(b.asin));
    const key = JSON.stringify([connection.id, connection.accountLabel, input.detail, products]);
    let cache = caches.get(runtime);
    if (!cache) {
        cache = new Map();
        caches.set(runtime, cache);
    }
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
        return await cached.value;
    }
    const value = Promise.all(
        products.map(async (product) => {
            const result = await runtime.readAmazonProducts(connection.id, {
                operation: 'get',
                ...product,
                include: input.detail ? ['marketData'] : ['shortName', 'cutoutThumbnail'],
            });
            const detail = parseProductDetails(result);
            if (detail.asin !== product.asin || detail.marketplaceId !== product.marketplaceId) {
                throw new Error('RankWrangler returned a different product.');
            }
            return detail;
        })
    );
    if (cache.size >= 500) {
        const oldest = cache.keys().next().value;
        if (oldest) {
            cache.delete(oldest);
        }
    }
    cache.set(key, { expires: Date.now() + 5 * 60_000, value });
    try {
        return await value;
    } catch (error) {
        cache.delete(key);
        throw error;
    }
}
