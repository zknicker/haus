import { describe, expect, test } from 'bun:test';
import type { CloudAgentPullRequestReading } from './cloud-agent-shared.ts';
import {
    deriveOpenThreadState,
    isOpenThreadExpired,
    type OpenThreadFacts,
    threadTitle,
} from './open-threads.ts';

const now = new Date('2026-11-05T12:00:00.000Z');
const lastActivityAt = '2026-11-05T11:00:00.000Z';
type Work = OpenThreadFacts['works'][number];

const live = { followUp: null, startedAt: lastActivityAt, state: 'working' } as const;
const done = {
    followUp: null,
    settledAt: lastActivityAt,
    startedAt: lastActivityAt,
    state: 'done',
} as const;
const failed = {
    errorCode: null,
    followUp: null,
    settledAt: lastActivityAt,
    state: 'failed',
    summary: null,
} as const;
const pendingInput = {
    followUp: null,
    question: null,
    settledAt: null,
    startedAt: lastActivityAt,
    state: 'pending-input',
} as const;

function work(
    job: Work['job'],
    pullRequest: Work['pullRequest'] = null,
    createdAt = lastActivityAt
) {
    return { activity: null, createdAt, job, pullRequest, updatedAt: lastActivityAt };
}

function pr(overrides: Partial<CloudAgentPullRequestReading> = {}): CloudAgentPullRequestReading {
    return {
        additions: 1,
        changedFiles: 1,
        checks: 'passing',
        deletions: 0,
        headSha: 'abc',
        number: 12,
        observedAt: lastActivityAt,
        repository: 'haus/haus',
        review: 'none',
        settledAt: null,
        source: 'github',
        state: 'open',
        title: 'Fix',
        url: 'https://github.com/haus/haus/pull/12',
        ...overrides,
    };
}

function state(facts: Partial<OpenThreadFacts>) {
    return deriveOpenThreadState(
        { lastActivityAt, unreadCount: 0, viewerWroteLast: false, works: [], ...facts },
        now
    );
}

describe('deriveOpenThreadState', () => {
    const cases: [string, Partial<OpenThreadFacts>, string, string][] = [
        ['unread', { unreadCount: 1, works: [work(failed)] }, 'unread', 'with-you'],
        ['failed job', { works: [work(failed)] }, 'job-failed', 'with-you'],
        [
            'failing checks',
            { works: [work(live, pr({ checks: 'failing' }))] },
            'checks-failing',
            'with-you',
        ],
        [
            'changes requested',
            { works: [work(done, pr({ review: 'changes-requested' }))] },
            'changes-requested',
            'with-you',
        ],
        ['approved', { works: [work(done, pr({ review: 'approved' }))] }, 'approved', 'with-you'],
        ['ready', { works: [work(done, pr())] }, 'ready-for-review', 'with-you'],
        ['working', { works: [work(live)] }, 'working', 'with-agents'],
        ['needs input', { works: [work(pendingInput)] }, 'needs-input', 'with-agents'],
        [
            'checks running',
            { works: [work(done, pr({ checks: 'pending' }))] },
            'checks-running',
            'with-agents',
        ],
        ['draft', { works: [work(done, pr({ state: 'draft' }))] }, 'draft', 'with-agents'],
        ['waiting', { viewerWroteLast: true }, 'waiting', 'with-agents'],
        [
            'merged',
            { works: [work(done, pr({ settledAt: lastActivityAt, state: 'merged' }))] },
            'merged',
            'recent',
        ],
        [
            'closed',
            { works: [work(done, pr({ settledAt: lastActivityAt, state: 'closed' }))] },
            'pr-closed',
            'recent',
        ],
        ['done', { works: [work(done)] }, 'done', 'recent'],
        ['anything else', {}, 'recent', 'recent'],
    ];

    test.each(cases)('%s', (_name, facts, expectedState, group) => {
        expect(state(facts)).toMatchObject({ group, state: expectedState });
    });

    test('a newer live job clears an older failure', () => {
        const retry = work(live, null, '2026-11-05T11:30:00.000Z');
        expect(state({ works: [work(failed), retry] }).state).toBe('working');
    });

    test('a Computer-only reading past seven days counts as settled', () => {
        const stale = pr({ observedAt: '2026-10-20T00:00:00.000Z', source: 'computer' });
        expect(state({ works: [work(done, stale)] }).state).toBe('recent');
    });

    test('merged expires twelve hours after it merged, recent a day after the last write', () => {
        const merged = pr({ settledAt: lastActivityAt, state: 'merged' });
        expect(state({ works: [work(done, merged)] }).expiresAt).toBe('2026-11-05T23:00:00.000Z');
        expect(state({}).expiresAt).toBe('2026-11-06T11:00:00.000Z');
        expect(state({ unreadCount: 1 }).expiresAt).toBeNull();
    });
});

test('an expired reading is no longer open', () => {
    expect(isOpenThreadExpired({ expiresAt: '2026-11-05T11:59:00.000Z' }, now)).toBe(true);
    expect(isOpenThreadExpired({ expiresAt: null }, now)).toBe(false);
});

test('a Thread title prefers its work, then the anchor line with references as text', () => {
    expect(threadTitle({ anchorContent: 'x', oldestWorkTitle: 'Fix the flake' })).toBe(
        'Fix the flake'
    );
    expect(
        threadTitle({
            anchorContent: '\n[@Blippy](agent://agt_1) ship it\nmore',
            oldestWorkTitle: null,
        })
    ).toBe('@Blippy ship it');
});
