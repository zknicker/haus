const cacheLimit = 500;
/** Covers the in-flight read until its settled value decides the real lifetime. */
const inFlightTtlMs = 5 * 60_000;

interface CacheEntry<T> {
    expires: number;
    value: Promise<T>;
}
export type ProductCache<T> = Map<string, CacheEntry<T>>;

/**
 * Serves a fresh entry or starts one lookup and caches it. An in-flight lookup
 * is shared; once settled, `ttlOf` sets the lifetime (`null` evicts), and a
 * rejection is evicted.
 */
export function readThroughCache<T>(input: {
    cache: ProductCache<T>;
    key: string;
    lookup: () => Promise<T>;
    ttlOf: (value: T) => number | null;
}): Promise<T> {
    const { cache, key } = input;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.value;
    }
    const value = input.lookup();
    storeEntry(cache, key, value, input.ttlOf);
    return value;
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
