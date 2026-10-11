import type { McpIconResolver } from './icons.ts';

/** Share anonymous branding between Recommended, creation, and legacy reads. */
export function cacheAnonymousMcpIcons(
    resolveIcon: McpIconResolver,
    now: () => number = Date.now
): McpIconResolver {
    const entries = new Map<string, { expiresAt: number; result: ReturnType<McpIconResolver> }>();
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
        if (cached && cached.expiresAt > now()) {
            return cached.result;
        }
        entries.delete(key);
        if (entries.size >= 128) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) {
                entries.delete(oldest);
            }
        }
        const entry = { expiresAt: Number.POSITIVE_INFINITY, result: resolveIcon(input) };
        entries.set(key, entry);
        entry.result.then(
            () => {
                entry.expiresAt = now() + 5 * 60_000;
            },
            () => {
                if (entries.get(key) === entry) {
                    entries.delete(key);
                }
            }
        );
        return entry.result;
    };
}
