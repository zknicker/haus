import { describe, expect, test } from 'bun:test';
import { readAppSourceFiles } from '../test-support/source-files.ts';
import { queryClientDefaultOptions, queryPolicy } from './query-policy.ts';

/**
 * Guarded contract for React Query usage. See docs/internals/react.md#queries.
 *
 * The app is event-driven: server events own cache invalidation, and named
 * `queryPolicy` presets own freshness. These rules keep future changes from
 * quietly reintroducing the refetch-per-mount and per-keystroke request storms
 * fixed in the query-caching overhaul. Do not widen an allowlist to make the
 * suite pass; a new entry is a deliberate policy decision that names its
 * reason. Polling, timers, and keyless invalidation live in
 * query-polling-contract.test.ts.
 */

/**
 * Files allowed to call useQuery without a named policy or explicit staleTime,
 * riding the 30s default floor instead. Every entry states why.
 */
const defaultFloorAllowlist: Record<string, string> = {
    'hooks/servers/use-accept-invitation.ts':
        'invitation preview answers "is this token good right now"; mount refetch is correctness',
};

/**
 * Files that may set an infinite `staleTime`. Events notify and React Query
 * owns recovery, so a changing Server read never opts out of staleness: each
 * entry is a settled read that cannot change, an isolated fixture client, or
 * the one changing family with its own recovery owner (specs/realtime-events.md,
 * "Entity query policy").
 */
const infiniteStaleTimeAllowlist: Record<string, string> = {
    'features/activation-preview/activation-preview-server.tsx':
        'isolated preview client answering from fixtures; no Server behind it',
    'hooks/servers/chat-message-entities.ts':
        'chat.message entities: the one changing family, kept fresh only by targeted invalidation and transcript list reseeding (bulk list recovery), never by staleness',
    'hooks/servers/use-message-routing.ts':
        'routing is immutable once the message and its inbox recipients commit',
    'hooks/servers/use-preload-chat.ts':
        'chat.engagements warm-up: volatile state its own stream re-reads on (re)start',
};

describe('query policy contract', () => {
    const files = readAppSourceFiles();

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

/**
 * Events are live notifications; React Query owns recovery. A changing Server
 * read that never stales would depend on every event arriving, which is the
 * failure the realtime redesign removed (specs/realtime-events.md, "Reverting
 * pushed snapshots").
 */
describe('staleness contract', () => {
    const files = readAppSourceFiles();

    test('no preset opts a read out of staleness', () => {
        for (const [name, preset] of Object.entries(queryPolicy)) {
            expect(Number.isFinite(preset.staleTime), `queryPolicy.${name} never stales`).toBe(
                true
            );
        }
    });

    test('only allowlisted files set an infinite staleTime', () => {
        const offenders = files
            .filter((file) =>
                /staleTime:\s*(Number\.POSITIVE_INFINITY|Infinity|'static')/.test(file.content)
            )
            .filter((file) => !(file.path in infiniteStaleTimeAllowlist))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('the infinite staleTime allowlist stays honest', () => {
        const byPath = new Map(files.map((file) => [file.path, file.content]));
        for (const path of Object.keys(infiniteStaleTimeAllowlist)) {
            expect(
                byPath.get(path),
                `${path} is allowlisted but no longer sets an infinite staleTime`
            ).toMatch(/staleTime:\s*(Number\.POSITIVE_INFINITY|Infinity|'static')/);
        }
    });

    test('no read refers to the removed pushed preset', () => {
        expect(
            files.filter((file) => /pushedSnapshot/.test(file.content)).map((f) => f.path)
        ).toEqual([]);
    });
});
