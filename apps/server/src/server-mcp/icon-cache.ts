import type { McpIconResolver, McpIconResolverInput } from './icons.ts';

interface CacheEntry {
    expiresAt: number;
    refreshing: boolean;
    result: ReturnType<McpIconResolver>;
}

const freshForMs = 5 * 60_000;
const maxEntries = 128;

/**
 * Share anonymous branding between Recommended, creation, and the startup repair.
 * Only a URL's first lookup waits on the network: once it settles, an expired
 * entry keeps answering while one background lookup replaces it.
 */
export function cacheAnonymousMcpIcons(
    resolveIcon: McpIconResolver,
    now: () => number = Date.now
): McpIconResolver {
    const entries = new Map<string, CacheEntry>();

    const lookUp = (input: McpIconResolverInput): CacheEntry => {
        const entry = {
            expiresAt: Number.POSITIVE_INFINITY,
            refreshing: false,
            result: resolveIcon(input),
        };
        entry.result.then(
            () => {
                entry.expiresAt = now() + freshForMs;
            },
            () => undefined
        );
        return entry;
    };

    const refresh = (key: string, stale: CacheEntry, input: McpIconResolverInput) => {
        stale.refreshing = true;
        const next = lookUp(input);
        next.result.then(
            () => {
                if (entries.get(key) === stale) {
                    entries.set(key, next);
                }
            },
            // A failed refresh keeps the last answer and retries on a later read.
            () => {
                stale.refreshing = false;
            }
        );
    };

    return (input) => {
        if (
            input.fetchImpl ||
            !Array.isArray(input.serverInfoIcons) ||
            input.serverInfoIcons.length
        ) {
            return resolveIcon(input);
        }
        const key = JSON.stringify([input.connectionUrl, input.preferPageIcon ?? false]);
        const cached = entries.get(key);
        if (cached) {
            if (cached.expiresAt <= now() && !cached.refreshing) {
                refresh(key, cached, input);
            }
            return cached.result;
        }
        if (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) {
                entries.delete(oldest);
            }
        }
        const entry = lookUp(input);
        entries.set(key, entry);
        // A rejected first lookup has no answer to keep, so the next read retries.
        entry.result.catch(() => {
            if (entries.get(key) === entry) {
                entries.delete(key);
            }
        });
        return entry.result;
    };
}
