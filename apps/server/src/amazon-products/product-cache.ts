import type { AmazonProductIdentity } from '@haus/api';

const cacheLimit = 500;
/** Covers the in-flight read until its settled value decides the real lifetime. */
const inFlightTtlMs = 5 * 60_000;

interface CacheEntry<T> {
    expires: number;
    value: Promise<T>;
}
export type ProductCache<T> = Map<string, CacheEntry<T>>;

/**
 * Serves fresh entries, looks up the rest in one call, and caches each new
 * lookup. In-flight lookups are shared; once settled, `ttlOf` sets the lifetime
 * (`null` evicts), and rejections are evicted.
 */
export function readThroughCache<T>(input: {
    cache: ProductCache<T>;
    keyOf: (product: AmazonProductIdentity) => string;
    lookup: (missing: AmazonProductIdentity[]) => Map<string, Promise<T>>;
    products: AmazonProductIdentity[];
    ttlOf: (value: T) => number | null;
}): Promise<T>[] {
    const { cache, keyOf, products } = input;
    const now = Date.now();
    const missing = products.filter((product) => {
        const entry = cache.get(keyOf(product));
        return !entry || entry.expires <= now;
    });
    const lookups = missing.length > 0 ? input.lookup(missing) : new Map<string, Promise<T>>();
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
            storeEntry(cache, keyOf(product), value, input.ttlOf);
        }
    }
    return values;
}

function storeEntry<T>(
    cache: ProductCache<T>,
    key: string,
    value: Promise<T>,
    ttlOf: (value: T) => number | null
) {
    cache.delete(key);
    while (cache.size >= cacheLimit) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) {
            break;
        }
        cache.delete(oldest);
    }
    const entry: CacheEntry<T> = { expires: Date.now() + inFlightTtlMs, value };
    cache.set(key, entry);
    const evict = () => {
        if (cache.get(key) === entry) {
            cache.delete(key);
        }
    };
    value.then((settled) => {
        const ttl = ttlOf(settled);
        if (ttl === null) {
            evict();
        } else {
            entry.expires = Date.now() + ttl;
        }
    }, evict);
}
