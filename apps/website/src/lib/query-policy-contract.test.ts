import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { queryClientDefaultOptions } from './query-policy.ts';

/**
 * Guarded contract for React Query usage. See docs/internals/react.md#queries.
 *
 * The app is event-driven: server events own cache invalidation, and named
 * `queryPolicy` presets own freshness. These rules keep future changes from
 * quietly reintroducing the refetch-per-mount and per-keystroke request storms
 * fixed in the query-caching overhaul. Do not widen an allowlist to make the
 * suite pass; a new entry is a deliberate policy decision that names its
 * reason.
 */

const sourceRoot = join(import.meta.dir, '..');

/**
 * Files allowed to call useQuery without a named policy or explicit staleTime,
 * riding the 30s default floor instead. Every entry states why.
 */
const defaultFloorAllowlist: Record<string, string> = {
    'hooks/servers/use-accept-invitation.ts':
        'invitation preview answers "is this token good right now"; mount refetch is correctness',
};

function listSourceFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(path);
        }
        if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}

describe('query policy contract', () => {
    const files = listSourceFiles(sourceRoot).map((path) => ({
        content: readFileSync(path, 'utf8'),
        path: relative(sourceRoot, path),
    }));

    test('both tRPC clients share a default staleTime floor', () => {
        expect(queryClientDefaultOptions.queries.staleTime).toBeGreaterThanOrEqual(30_000);
    });

    test('browser reconnect leaves Server reads to the socket reconnect', () => {
        // Each event stream recovers its reads when the socket comes back
        // (query-reconnect-recovery.ts); an online event refetching them too
        // ran a second, earlier pass before the socket had even reconnected.
        expect(queryClientDefaultOptions.queries.refetchOnReconnect).toBe(false);
    });

    test('refetchOnMount: false stays inside query-policy.ts', () => {
        // Server events invalidate inactive queries without refetching them, so
        // a query that unmounts with navigation must keep its stale-gated mount
        // refetch. Disabling it anywhere else reintroduces the stale-thread bug.
        const offenders = files
            .filter((file) => file.path !== 'lib/query-policy.ts')
            .filter((file) => /refetchOnMount:\s*false/.test(file.content))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('every useQuery caller declares a policy or is an allowlisted floor rider', () => {
        const offenders = files
            .filter((file) =>
                /\.useQuery\(|\.useInfiniteQuery\(|useSuspenseQuery\(/.test(file.content)
            )
            .filter((file) => !/queryPolicy\.|staleTime/.test(file.content))
            .filter((file) => !(file.path in defaultFloorAllowlist))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('the default-floor allowlist stays honest', () => {
        // Entries must still exist and must still lack an explicit policy;
        // stale entries get removed so the list only names real exceptions.
        const byPath = new Map(files.map((file) => [file.path, file.content]));
        for (const path of Object.keys(defaultFloorAllowlist)) {
            const content = byPath.get(path);
            expect(content, `${path} is allowlisted but no longer exists`).toBeDefined();
            expect(
                content && /queryPolicy\.|staleTime/.test(content),
                `${path} now declares a policy; remove its allowlist entry`
            ).toBe(false);
        }
    });
});
