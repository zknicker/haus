import { describe, expect, test } from 'bun:test';
import { readAppSourceFiles, type SourceFile } from '../test-support/source-files.ts';

/**
 * Guarded contract for App traffic that no human action causes: polls, timers,
 * focus and reconnect refetches, and invalidations broad enough to refetch
 * everything. An idle App sends only these justified requests
 * (.agents/skills/perf-haus-app/SKILL.md, "Idle traffic"); the idle-silence
 * App e2e spec measures the same promise on the wire.
 *
 * A failure here means new code polls or refetches where a Server event
 * belongs. Prefer an event (docs/api/realtime.md). Add an allowlist entry only
 * when no event can exist, and name why in the entry: reviewers read these.
 */

/** Files that may poll with `refetchInterval`, and why no event replaces it. */
const refetchIntervalAllowlist: Record<string, string> = {
    'features/computers/computer-login-view.tsx':
        'Computer login status, 1 s only once approved, until the Computer finishes attaching',
    'features/mentions/use-amazon-product.ts':
        'Amazon product retry, only while the preview is open after bounded retries gave up',
    'features/updates/use-haus-update.ts':
        'Desktop release check every 10 min; releases are published outside Haus Server',
    'hooks/servers/use-cloud-agent-capability.ts':
        'Cloud Agent sign-in, 1 s only while sign-in is waiting; volatile Computer state',
    'hooks/servers/use-server.ts':
        'onboarding server.bySlug, 1 s only while onboarding is incomplete (missed-event fallback)',
    'hooks/updates/use-website-update.ts':
        'website build check every 60 s; deployments have no durable event',
};

/**
 * Files that may run `setInterval`. A `clock` re-renders a time label and a
 * `dev` interval serves a dev-only tool; neither may fetch. A `poll` names
 * what it reads and why that is not a request storm.
 */
const intervalAllowlist: Record<string, { kind: 'clock' | 'dev' | 'poll'; reason: string }> = {
    'components/time/relative-time.tsx': { kind: 'clock', reason: 'relative timestamps' },
    'features/chats/working-log.tsx': { kind: 'clock', reason: 'live turn elapsed time' },
    'features/dev-tools/render-log.ts': {
        kind: 'dev',
        reason: 'dev-build render log flushes its counts to the console once per second',
    },
    'features/members/agent-profile/agent-activity-log.tsx': {
        kind: 'clock',
        reason: 'activity log elapsed time',
    },
    'features/turn-trace/use-turn-trace-now.ts': { kind: 'clock', reason: 'turn trace clock' },
    'lib/haus-server.tsx': {
        kind: 'poll',
        reason: 'session refresh watcher: reads the local Clerk token every 10 s and sends one socket session.refresh per rotation, never an HTTP read',
    },
};

/**
 * Files that schedule a `setTimeout` and also fetch, invalidate, or mutate.
 * Each must be a one-shot (debounce, batch window, deadline), never a timer
 * that re-arms itself to fetch again; a recurring loop needs a reason here.
 */
const timerFetchAllowlist: Record<string, string> = {
    'features/servers/chat/use-composition-draft.ts':
        'one-shot 150 ms debounce of the composition draft publish',
    'features/updates/use-haus-update-run.ts':
        'deadlines and step waits inside a human-pressed update run',
    'hooks/servers/chat-events/use-chat-event-stream.tsx': 'one-shot chat event batch window',
    'hooks/servers/use-chat-message-navigation.ts': 'one-shot jump highlight removal',
    'hooks/servers/use-chat-read.ts': 'one-shot settle after a read receipt lands',
    'hooks/servers/use-idle-chat-warming.ts': 'one idle warm pass, bounded to 2 concurrent reads',
};

/** Calls that may invalidate or reset every query (no `queryKey` or `predicate`). */
const keylessInvalidationAllowlist: Record<string, string> = {
    'features/shell/use-tab-menu-bar.ts': 'the human pressed Reload in the desktop Tab menu',
    'lib/query-cache-handoff.ts':
        "refetchType 'none': marks a handed-off cache stale without fetching anything",
};

/** The reconnect recovery owners (lib/query-reconnect-recovery.ts). */
const reconnectRecoveryOwners = ['lib/haus-server.tsx', 'lib/query-reconnect-recovery.ts'];

/** Files that may turn on focus or browser-reconnect refetch. */
const focusRefetchAllowlist: Record<string, string> = {
    'hooks/servers/use-cloud-agent-capability.ts':
        'returning from the Cursor sign-in browser tab rechecks sign-in once',
    'hooks/updates/use-website-update.ts':
        'returning to Haus rechecks the deployed build (a static file, not a Server read)',
};

const fetchPattern =
    /\b(fetch|refetch|invalidate|invalidateQueries|mutate|mutateAsync)\(|\.query\(/;

describe('query polling contract', () => {
    const files = readAppSourceFiles();

    test('refetchInterval polls only in allowlisted files', () => {
        expectOnlyAllowlisted(
            matching(files, /\brefetchInterval\s*:/),
            refetchIntervalAllowlist,
            'polls with refetchInterval'
        );
    });

    test('refetchIntervalInBackground is never on', () => {
        expect(paths(matching(files, /refetchIntervalInBackground/))).toEqual([]);
    });

    test('setInterval runs only in allowlisted files, and clocks never fetch', () => {
        expectOnlyAllowlisted(
            matching(files, /\bsetInterval\(/),
            intervalAllowlist,
            'runs a setInterval'
        );
        const fetchingClocks = files.filter(
            (file) =>
                intervalAllowlist[file.path]?.kind === 'clock' && fetchPattern.test(file.content)
        );
        expect(
            paths(fetchingClocks),
            'A clock or dev interval never fetches. Move the fetch to an event, or make the entry a `poll` with a reason.'
        ).toEqual([]);
    });

    test('timers beside fetches are allowlisted one-shots', () => {
        expectOnlyAllowlisted(
            files.filter(
                (file) => /\bsetTimeout\(/.test(file.content) && fetchPattern.test(file.content)
            ),
            timerFetchAllowlist,
            'schedules a setTimeout in a file that fetches, invalidates, or mutates'
        );
    });

    test('invalidation and reset always name what they touch', () => {
        const offenders = files.filter((file) =>
            callArguments(file.content, /\.(invalidateQueries|resetQueries)\(/g).some(
                (args) => !/\b(queryKey|predicate)\b/.test(args)
            )
        );
        const rootUtils = matching(files, /\butils\.(invalidate|reset|refetch)\(/);
        expectOnlyAllowlisted(
            [...offenders, ...rootUtils],
            keylessInvalidationAllowlist,
            'invalidates or resets every query (no queryKey, predicate, or procedure)'
        );
    });

    test('refetchQueries stays inside reconnect recovery', () => {
        const offenders = matching(files, /\.refetchQueries\(/).filter(
            (file) => !reconnectRecoveryOwners.includes(file.path)
        );
        expect(
            paths(offenders),
            'refetchQueries refetches regardless of staleness. Invalidate the exact key and let observers refetch, or route recovery through lib/query-reconnect-recovery.ts.'
        ).toEqual([]);
    });

    test('focus and reconnect refetch stay off outside the policy', () => {
        expectOnlyAllowlisted(
            matching(files, /\brefetchOn(WindowFocus|Reconnect)\s*:(?!\s*false\b)/).filter(
                (file) => file.path !== 'lib/query-policy.ts'
            ),
            focusRefetchAllowlist,
            'turns on refetchOnWindowFocus or refetchOnReconnect'
        );
    });

    test('every allowlist entry still names a real exception', () => {
        const byPath = new Map(files.map((file) => [file.path, file.content]));
        const stillNeeded: [Record<string, unknown>, RegExp][] = [
            [refetchIntervalAllowlist, /\brefetchInterval\s*:/],
            [intervalAllowlist, /\bsetInterval\(/],
            [timerFetchAllowlist, /\bsetTimeout\(/],
            [focusRefetchAllowlist, /\brefetchOn(WindowFocus|Reconnect)\s*:(?!\s*false\b)/],
            [
                keylessInvalidationAllowlist,
                /\.(invalidateQueries|resetQueries)\(|utils\.invalidate\(/,
            ],
        ];
        for (const [allowlist, pattern] of stillNeeded) {
            for (const path of Object.keys(allowlist)) {
                const content = byPath.get(path);
                expect(
                    content !== undefined && pattern.test(content),
                    `${path} is allowlisted for ${pattern} but no longer matches; remove its entry`
                ).toBe(true);
            }
        }
    });
});

function matching(files: SourceFile[], pattern: RegExp) {
    return files.filter((file) => pattern.test(file.content));
}

function paths(files: SourceFile[]) {
    return [...new Set(files.map((file) => file.path))].sort();
}

function expectOnlyAllowlisted(found: SourceFile[], allowlist: object, what: string) {
    const offenders = paths(found).filter((path) => !(path in allowlist));
    expect(
        offenders,
        [
            `New code ${what}:`,
            ...offenders.map((path) => `  ${path}`),
            'An idle App must stay silent. Replace the poll or broad refetch with a Server event',
            '(docs/api/realtime.md) or an exact-key invalidation. If no event can exist, add an',
            'allowlist entry in apps/website/src/lib/query-polling-contract.test.ts with its reason.',
        ].join('\n')
    ).toEqual([]);
}

/** The argument text of each call matching `callee`, up to its closing parenthesis. */
function callArguments(content: string, callee: RegExp): string[] {
    const found: string[] = [];
    for (const match of content.matchAll(callee)) {
        const start = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let end = start;
        while (end < content.length && depth > 0) {
            const char = content[end];
            depth += char === '(' ? 1 : char === ')' ? -1 : 0;
            end += 1;
        }
        found.push(content.slice(start, end - 1));
    }
    return found;
}
