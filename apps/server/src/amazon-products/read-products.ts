import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    rankWranglerMcpUrl,
} from '@haus/api';
import { and, arrayContains, asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { lookupProductDetail, lookupProductSummaries } from './lookup-products.ts';

const cacheTtlMs = 5 * 60_000;
/** Short enough that the App's bounded refetch reaches RankWrangler again. */
const pendingEnrichmentTtlMs = 2000;
const cacheLimit = 500;

interface CacheEntry {
    expires: number;
    value: Promise<AmazonProductDetail>;
}
const caches = new WeakMap<McpRuntime, Map<string, CacheEntry>>();

export function clearAmazonProductCache(runtime: McpRuntime) {
    caches.delete(runtime);
}

export async function readAmazonProducts(
    db: HausDatabase,
    runtime: McpRuntime,
    member: HausUser | null,
    input: { serverId: string; products: AmazonProductIdentity[]; detail: boolean }
): Promise<AmazonProductDetail[] | null> {
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
    ];
    const keyOf = (product: AmazonProductIdentity) =>
        JSON.stringify([connection.id, connection.accountLabel, input.detail, product]);
    let cache = caches.get(runtime);
    if (!cache) {
        cache = new Map();
        caches.set(runtime, cache);
    }
    const now = Date.now();
    const missing = products.filter((product) => {
        const entry = cache.get(keyOf(product));
        return !entry || entry.expires <= now;
    });
    const read = (args: Record<string, unknown>) => runtime.readAmazonProducts(connection.id, args);
    const lookups =
        input.detail || missing.length === 0
            ? new Map(missing.map((product) => [product.asin, lookupProductDetail(read, product)]))
            : lookupProductSummaries(read, missing);
    // Resolve every value before storing, so eviction by this call cannot drop a hit.
    const values = products.map((product) => {
        const value = lookups.get(product.asin) ?? cache.get(keyOf(product))?.value;
        if (!value) {
            throw new Error('Amazon product lookup was not scheduled.');
        }
        return value;
    });
    for (const product of missing) {
        const value = lookups.get(product.asin);
        if (value) {
            storeEntry(cache, keyOf(product), value);
        }
    }
    // One unknown ASIN must not fail the other chips sharing this batched read.
    const settled = await Promise.allSettled(values);
    const found = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
    );
    const failure = settled.find((result) => result.status === 'rejected');
    if (found.length === 0 && failure) {
        throw failure.reason;
    }
    return found;
}

/** Errors are never cached; unfinished enrichment is cached only briefly. */
function storeEntry(
    cache: Map<string, CacheEntry>,
    key: string,
    value: Promise<AmazonProductDetail>
) {
    cache.delete(key);
    while (cache.size >= cacheLimit) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) {
            break;
        }
        cache.delete(oldest);
    }
    const entry: CacheEntry = { expires: Date.now() + cacheTtlMs, value };
    cache.set(key, entry);
    value.then(
        (product) => {
            if (product.enrichment === 'pending') {
                entry.expires = Date.now() + pendingEnrichmentTtlMs;
            }
        },
        () => {
            if (cache.get(key) === entry) {
                cache.delete(key);
            }
        }
    );
}
