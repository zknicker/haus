import { afterAll, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

import {
    createPullRequestReader,
    pullRequestAddressOf,
    pullRequestOf,
} from './pull-request-reader.ts';

const observedAt = '2026-09-05T12:00:00.000Z';

const payload = {
    additions: 128,
    changed_files: 7,
    deletions: 19,
    draft: false,
    merged: false,
    number: 56,
    state: 'open',
};

test('a GitHub pull-request URL reads back as one address', () => {
    expect(pullRequestAddressOf('https://github.com/merchbaseco/tmterminal/pull/56')).toEqual({
        number: 56,
        owner: 'merchbaseco',
        repo: 'tmterminal',
    });
    expect(pullRequestAddressOf('https://github.com/merchbaseco/tmterminal/pull/56/')).toEqual({
        number: 56,
        owner: 'merchbaseco',
        repo: 'tmterminal',
    });
});

test('anything that is not a GitHub pull request has no address to read', () => {
    for (const url of [
        'https://gitlab.com/merchbaseco/tmterminal/-/merge_requests/56',
        'https://github.com/merchbaseco/tmterminal',
        'https://github.com/merchbaseco/tmterminal/pull/0',
        'https://github.com/merchbaseco/tmterminal/pull/abc',
        'not a url',
        '',
    ]) {
        expect(pullRequestAddressOf(url)).toBeNull();
    }
});

test('each GitHub lifecycle reads back as the state Haus records', () => {
    const cases: [Record<string, unknown>, string][] = [
        [{ draft: true, state: 'open' }, 'draft'],
        [{ draft: false, state: 'open' }, 'open'],
        [{ merged: true, state: 'closed' }, 'merged'],
        [{ merged: false, merged_at: '2026-09-04T09:00:00Z', state: 'closed' }, 'merged'],
        [{ merged: false, state: 'closed' }, 'closed'],
        // A merged pull request is also closed, and a merged draft is merged.
        [{ draft: true, merged: true, state: 'closed' }, 'merged'],
    ];
    for (const [overrides, state] of cases) {
        expect(pullRequestOf({ ...payload, ...overrides }, observedAt)?.state).toBe(state as never);
    }
});

test('a payload missing its diff counts is no snapshot rather than zeros', () => {
    expect(pullRequestOf({ number: 56, state: 'open' }, observedAt)).toBeNull();
    expect(pullRequestOf(null, observedAt)).toBeNull();
});

test('a read carries the diff counts GitHub reports', async () => {
    const reader = createPullRequestReader({
        runtime,
        fetch: () => Promise.resolve(Response.json(payload)),
        now: () => Date.parse(observedAt),
        token: () => Promise.resolve(null),
    });

    expect(await reader.read('https://github.com/merchbaseco/tmterminal/pull/56')).toEqual({
        additions: 128,
        changedFiles: 7,
        deletions: 19,
        number: 56,
        observedAt,
        state: 'open',
    });
});

test('a resolved token authorizes the read and never appears anywhere else', async () => {
    const headers: Record<string, string>[] = [];
    const reader = createPullRequestReader({
        runtime,
        fetch: (_url, init) => {
            headers.push({ ...((init?.headers ?? {}) as Record<string, string>) });
            return Promise.resolve(Response.json(payload));
        },
        now: () => Date.parse(observedAt),
        token: () => Promise.resolve('gho_local_gh_cli_token'),
    });

    await reader.read('https://github.com/merchbaseco/tmterminal/pull/56');

    expect(headers[0]?.authorization).toBe('Bearer gho_local_gh_cli_token');
});

test('a 5xx is retried once and a second failure is no snapshot', async () => {
    let calls = 0;
    const reader = createPullRequestReader({
        runtime,
        fetch: () => {
            calls += 1;
            return Promise.resolve(new Response('', { status: 502 }));
        },
        now: () => Date.parse(observedAt),
        onDebug: () => undefined,
        token: () => Promise.resolve(null),
    });

    expect(await reader.read('https://github.com/merchbaseco/tmterminal/pull/56')).toBeNull();
    expect(calls).toBe(2);
});

test('a 404 is not retried, and a thrown request is no snapshot either', async () => {
    let calls = 0;
    const missing = createPullRequestReader({
        runtime,
        fetch: () => {
            calls += 1;
            return Promise.resolve(new Response('', { status: 404 }));
        },
        now: () => Date.parse(observedAt),
        onDebug: () => undefined,
        token: () => Promise.resolve(null),
    });
    expect(await missing.read('https://github.com/merchbaseco/tmterminal/pull/56')).toBeNull();
    expect(calls).toBe(1);

    const debug: string[] = [];
    const offline = createPullRequestReader({
        runtime,
        fetch: () => Promise.reject(new Error('network is unreachable')),
        now: () => Date.parse(observedAt),
        onDebug: (message) => debug.push(message),
        token: () => Promise.resolve(null),
    });
    expect(await offline.read('https://github.com/merchbaseco/tmterminal/pull/56')).toBeNull();
    expect(debug[0]).toContain('merchbaseco/tmterminal#56');
});

test('one pull request is read at most once per throttle window', async () => {
    let calls = 0;
    let clock = Date.parse(observedAt);
    const reader = createPullRequestReader({
        runtime,
        fetch: () => {
            calls += 1;
            return Promise.resolve(Response.json(payload));
        },
        now: () => clock,
        throttleMs: 30_000,
        token: () => Promise.resolve(null),
    });
    const url = 'https://github.com/merchbaseco/tmterminal/pull/56';

    const first = await reader.read(url);
    clock += 29_000;
    expect(await reader.read(url)).toEqual(first);
    expect(calls).toBe(1);

    clock += 2000;
    await reader.read(url);
    expect(calls).toBe(2);
});
