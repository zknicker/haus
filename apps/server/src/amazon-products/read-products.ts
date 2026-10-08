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
import { lookupProductDetail, lookupProductSummary } from './lookup-products.ts';
import { type ProductCache, readThroughCache } from './product-cache.ts';

const cacheTtlMs = 5 * 60_000;

interface RuntimeCaches {
    details: ProductCache<AmazonProductDetail>;
    summaries: ProductCache<AmazonProductResult>;
}
const caches = new WeakMap<McpRuntime, RuntimeCaches>();

export function clearAmazonProductCache(runtime: McpRuntime) {
    caches.delete(runtime);
}

/** One chip summary; `null` means the Server has no connected RankWrangler account. */
export async function readAmazonProductSummary(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { serverId: string; product: AmazonProductIdentity }
): Promise<AmazonProductResult | null> {
    const source = await connectedSource(db, runtime, member, input.serverId);
    if (!source) {
        return null;
    }
    return await readThroughCache({
        cache: source.caches.summaries,
        key: source.keyOf(input.product),
        lookup: () => lookupProductSummary(source.read, input.product),
        // Transient and final misses are never cached.
        ttlOf: (result) => (result.status === 'found' ? cacheTtlMs : null),
    });
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
    return await readThroughCache({
        cache: source.caches.details,
        key: source.keyOf(input.product),
        lookup: () => lookupProductDetail(source.read, input.product),
        ttlOf: () => cacheTtlMs,
    });
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
