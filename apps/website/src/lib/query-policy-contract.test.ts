import { describe, expect, test } from 'bun:test';
import { readAppSourceFiles } from '../test-support/source-files.ts';
import { pushedSnapshotCoverage } from './pushed-snapshot-coverage.ts';
import { queryClientDefaultOptions, queryPolicy } from './query-policy.ts';
import { streamRecoveredReads } from './query-reconnect-recovery.ts';

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
 * Files that may set an infinite `staleTime` outside `queryPolicy.pushedSnapshot`.
 * Each read is either immutable or owned by its own stream; a Server read that
 * events keep exact uses the preset and joins `pushedSnapshotCoverage` instead.
 */
const infiniteStaleTimeAllowlist: Record<string, string> = {
    'features/activation-preview/activation-preview-server.tsx':
        'isolated preview client answering from fixtures; no Server behind it',
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
 * `queryPolicy.pushedSnapshot` never stales on a timer, so a read may use it
 * only once every Server write that changes it is proven to reach the App as
 * an event (lib/pushed-snapshot-coverage.ts). These rules keep a future read
 * from opting in without that proof, and keep every opted-in read's readers,
 * listeners, and reconnect recovery in step.
 */
/** Code that applies the preset; a backticked mention in a comment does not count. */
const usesPushedPreset = /(?<!`)queryPolicy\.pushedSnapshot\b/;

describe('pushed snapshot contract', () => {
    const files = readAppSourceFiles();
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    const coverage = Object.entries(pushedSnapshotCoverage);

    test('pushed reads still invalidate', () => {
        // `'static'` would ignore invalidation; events must still be able to stale it.
        expect(queryPolicy.pushedSnapshot.staleTime).toBe(Number.POSITIVE_INFINITY);
    });

    test('only registered files use the pushed preset', () => {
        const registered = new Set<string>(coverage.flatMap(([, entry]) => entry.files));
        const offenders = files
            .filter((file) => file.path !== 'lib/query-policy.ts')
            .filter((file) => usesPushedPreset.test(file.content))
            .filter((file) => !registered.has(file.path))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('no read bypasses the preset with a bare infinite staleTime', () => {
        const offenders = files
            .filter((file) => file.path !== 'lib/query-policy.ts')
            .filter((file) =>
                /staleTime:\s*(Number\.POSITIVE_INFINITY|Infinity|'static')/.test(file.content)
            )
            .filter((file) => !(file.path in infiniteStaleTimeAllowlist))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('every reader of a pushed read uses the pushed preset', () => {
        // One reader on a timed policy would refetch the shared key on mount
        // and hide a coverage gap behind it, so readers never mix policies.
        for (const [read, entry] of coverage) {
            const caller = new RegExp(
                `\\.${read.replace('.', '\\.')}\\.(useQuery|useSuspenseQuery|useInfiniteQuery|prefetch|fetch|ensureData)\\(`,
                'g'
            );
            for (const file of files) {
                for (const match of file.content.matchAll(caller)) {
                    const options = file.content.slice(match.index, match.index + 400);
                    const policy = options.match(/queryPolicy\.(\w+)/)?.[1];
                    expect(
                        { file: file.path, policy, read },
                        `${file.path} reads ${read} outside the pushed preset`
                    ).toEqual({ file: file.path, policy: 'pushedSnapshot', read });
                    expect(entry.files as readonly string[]).toContain(file.path);
                }
            }
            for (const path of entry.files) {
                expect(byPath.get(path), `${path} is registered for ${read}`).toMatch(
                    usesPushedPreset
                );
            }
        }
    });

    test('every covering event has a listener that refreshes the read', () => {
        const chatListeners = files.filter(
            (file) =>
                file.path.startsWith('hooks/servers/chat-events/') &&
                file.content.includes('useChatEvent(')
        );
        const serverListener = byPath.get('hooks/servers/use-server-events.ts') ?? '';
        for (const [read, entry] of coverage) {
            const refresh = `${read}.invalidate(`;
            for (const event of entry.events) {
                const listeners = event.startsWith('server.updated:')
                    ? [serverListener]
                    : chatListeners
                          .filter((file) => file.content.includes(`'${event}'`))
                          .map((file) => file.content);
                expect(
                    listeners.some((content) => content.includes(refresh)),
                    `${read} names ${event}, but no ${event} listener refreshes it`
                ).toBe(true);
            }
        }
    });

    test('every pushed read has a stream that recovers it after a gap', () => {
        for (const [read, entry] of coverage) {
            expect(entry.recovery.length).toBeGreaterThan(0);
            for (const owner of entry.recovery) {
                expect(streamRecoveredReads[owner] as readonly string[]).toContain(read);
            }
        }
    });
});
