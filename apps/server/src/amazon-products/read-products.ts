import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductResult,
    rankWranglerMcpUrl,
} from '@haus/api';
import { and, arrayContains, asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { lookupProductDetail, lookupProductSummaries } from './lookup-products.ts';
import { type ProductCache, readThroughCache } from './product-cache.ts';

const cacheTtlMs = 5 * 60_000;
/** Short enough that the App's bounded refetch reaches RankWrangler again. */
const pendingEnrichmentTtlMs = 2000;

interface RuntimeCaches {
    details: ProductCache<AmazonProductDetail>;
    summaries: ProductCache<AmazonProductResult>;
}
const caches = new WeakMap<McpRuntime, RuntimeCaches>();

export function clearAmazonProductCache(runtime: McpRuntime) {
    caches.delete(runtime);
}

/**
 * Chip summaries, one result per requested product. `null` means the Server
 * has no connected RankWrangler account.
 */
export async function readAmazonProductSummaries(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { serverId: string; products: AmazonProductIdentity[] }
): Promise<AmazonProductResult[] | null> {
    const source = await connectedSource(db, runtime, member, input.serverId);
    if (!source) {
        return null;
    }
    return await Promise.all(
        readThroughCache({
            cache: source.caches.summaries,
            keyOf: source.keyOf,
            lookup: (missing) => lookupProductSummaries(source.read, missing),
            products: uniqueProducts(input.products),
            ttlOf: summaryTtl,
        })
    );
}

/** Rejects when RankWrangler cannot provide the product's market data. */
export async function readAmazonProductDetail(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { serverId: string; product: AmazonProductIdentity }
): Promise<AmazonProductDetail | null> {
    const source = await connectedSource(db, runtime, member, input.serverId);
    if (!source) {
        return null;
    }
    const [detail] = readThroughCache({
        cache: source.caches.details,
        keyOf: source.keyOf,
        lookup: (missing) =>
            new Map(
                missing.map((product) => [product.asin, lookupProductDetail(source.read, product)])
            ),
        products: [input.product],
        ttlOf: () => cacheTtlMs,
    });
    return detail ? await detail : null;
}

async function connectedSource(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    serverId: string
) {
    await requireServerMembership(db, member, serverId);
    const [connection] = await db
        .select()
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, serverId),
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
    let runtimeCaches = caches.get(runtime);
    if (!runtimeCaches) {
        runtimeCaches = { summaries: new Map(), details: new Map() };
        caches.set(runtime, runtimeCaches);
    }
    return {
        caches: runtimeCaches,
        keyOf: (product: AmazonProductIdentity) =>
            JSON.stringify([connection.id, connection.accountLabel, product]),
        read: (args: Record<string, unknown>) => runtime.readAmazonProducts(connection.id, args),
    };
}

/** Transient and final misses are never cached; unfinished enrichment only briefly. */
function summaryTtl(result: AmazonProductResult): number | null {
    if (result.status !== 'found') {
        return null;
    }
    return result.product.enrichment === 'pending' ? pendingEnrichmentTtlMs : cacheTtlMs;
}

function uniqueProducts(products: AmazonProductIdentity[]): AmazonProductIdentity[] {
    return [...new Map(products.map((product) => [product.asin, product])).values()];
}
