import { describe, expect, test } from 'bun:test';
import type { CloudAgentPullRequestReading } from './cloud-agent-shared.ts';
import {
    deriveOpenThreadState,
    isOpenThreadExpired,
    isOpenThreadInSidebar,
    type OpenThreadFacts,
} from './open-thread-state.ts';
import { threadTitle } from './open-threads.ts';

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
        { lastActivityAt, unreadCount: 0, viewerTookPart: false, works: [], ...facts },
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
        ['a conversation the viewer took part in', { viewerTookPart: true }, 'active', 'recent'],
        ['anything else', {}, 'recent', 'recent'],
    ];

    test.each(cases)('%s', (_name, facts, expectedState, group) => {
        expect(state(facts)).toMatchObject({ group, state: expectedState });
    });

    test('a live job outranks a failed one', () => {
        expect(state({ works: [work(failed), work(live)] }).state).toBe('working');
    });

    test('a Computer-only reading past seven days says nothing, so the settled job decides', () => {
        const stale = pr({ observedAt: '2026-10-20T00:00:00.000Z', source: 'computer' });
        expect(state({ lastActivityAt: null, works: [work(done, stale)] })).toMatchObject({
            at: lastActivityAt,
            expiresAt: '2026-11-06T11:00:00.000Z',
            state: 'done',
        });
    });

    test('a cancelled job is settled, timed from when it settled', () => {
        const cancelled = {
            followUp: null,
            settledAt: lastActivityAt,
            state: 'cancelled',
        } as const;
        expect(state({ lastActivityAt: null, works: [work(cancelled)] }).state).toBe('done');
    });

    test('a settled fact with no recorded time is already over, never permanent', () => {
        const merged = pr({ settledAt: null, source: 'computer', state: 'merged' });
        expect(state({ works: [work(done, merged)] }).expiresAt).toBe(now.toISOString());
        expect(state({ lastActivityAt: null }).expiresAt).toBe(now.toISOString());
    });

    test('merged expires twelve hours after it merged, recent a day after the last write', () => {
        const merged = pr({ settledAt: lastActivityAt, state: 'merged' });
        expect(state({ works: [work(done, merged)] }).expiresAt).toBe('2026-11-05T23:00:00.000Z');
        expect(state({}).expiresAt).toBe('2026-11-06T11:00:00.000Z');
        expect(state({ unreadCount: 1 }).expiresAt).toBeNull();
    });

    test('who wrote last does not matter: a closing thanks reads like any conversation', () => {
        // The viewer's own "thanks" was the last write; nothing claims it waits on a reply.
        expect(state({ viewerTookPart: true })).toMatchObject({
            expiresAt: '2026-11-06T11:00:00.000Z',
            state: 'active',
        });
    });

    test('an Agent reply the viewer has read stays active in a Thread they took part in', () => {
        expect(state({ unreadCount: 0, viewerTookPart: true }).state).toBe('active');
        expect(state({ unreadCount: 2, viewerTookPart: true }).state).toBe('unread');
    });

    test('work outranks taking part', () => {
        expect(state({ viewerTookPart: true, works: [work(live)] }).state).toBe('working');
        expect(state({ viewerTookPart: true, works: [work(done)] }).state).toBe('done');
    });
});

describe('isOpenThreadInSidebar', () => {
    const row = (
        state: Parameters<typeof isOpenThreadInSidebar>[0]['state'],
        overrides: { jobCount?: number; viewerTookPart?: boolean } = {}
    ) => ({ jobCount: 0, state, viewerTookPart: false, ...overrides });

    test('work in motion and settled work are listed', () => {
        for (const listed of ['working', 'job-failed', 'merged', 'pr-closed', 'done'] as const) {
            expect(isOpenThreadInSidebar(row(listed, { jobCount: 1 }))).toBe(true);
        }
    });

    test('a conversation is listed only when the viewer took part', () => {
        expect(isOpenThreadInSidebar(row('active', { viewerTookPart: true }))).toBe(true);
        expect(isOpenThreadInSidebar(row('recent'))).toBe(false);
    });

    test('unread is listed when the viewer took part or the Thread holds work', () => {
        expect(isOpenThreadInSidebar(row('unread', { viewerTookPart: true }))).toBe(true);
        expect(isOpenThreadInSidebar(row('unread', { jobCount: 1 }))).toBe(true);
        // An Agent-started conversation the viewer never touched stays in the Inbox.
        expect(isOpenThreadInSidebar(row('unread'))).toBe(false);
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

test('a Thread title drops the anchor line leading emoji, unless that is all it says', () => {
    const title = (anchorContent: string) => threadTitle({ anchorContent, oldestWorkTitle: null });
    expect(title('🎄 Thursday best-sellers watch')).toBe('Thursday best-sellers watch');
    expect(title('👩🏽‍💻🚀  Deploy notes')).toBe('Deploy notes');
    expect(title('🇺🇸 Launch')).toBe('Launch');
    expect(title('🎉')).toBe('🎉');
    expect(title('Ship it 🚀')).toBe('Ship it 🚀');
    expect(title('2026 plan')).toBe('2026 plan');
});
