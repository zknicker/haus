import { expect, test } from 'bun:test';
import type { OpenThread } from '@haus/api';
import { sidebarOpenThreads, sortOpenThreads } from './use-open-threads.ts';

const now = new Date('2026-11-05T12:00:00.000Z');

function thread(id: string, group: OpenThread['group'], expiresAt: string | null = null) {
    return { expiresAt, group, threadChatId: id } as OpenThread;
}

function row(id: string, overrides: Partial<OpenThread>) {
    return {
        expiresAt: null,
        group: 'recent',
        jobCount: 0,
        state: 'active',
        threadChatId: id,
        viewerTookPart: true,
        ...overrides,
    } as OpenThread;
}

test('rows sort by group, keep server order within one, and hide once expired', () => {
    const sorted = sortOpenThreads(
        [
            thread('recent', 'recent'),
            thread('agents', 'with-agents'),
            thread('you-new', 'with-you'),
            thread('you-old', 'with-you'),
            thread('gone', 'recent', '2026-11-05T11:00:00.000Z'),
        ],
        now
    );
    expect(sorted.map((entry) => entry.threadChatId)).toEqual([
        'you-new',
        'you-old',
        'agents',
        'recent',
    ]);
});

test('the sidebar lists work first, then conversations, each in server order', () => {
    const layout = sidebarOpenThreads(
        [
            row('talk-new', {}),
            row('work-new', { group: 'with-agents', jobCount: 1, state: 'working' }),
            row('talk-old', { group: 'with-you', state: 'unread' }),
            row('work-old', { jobCount: 1, state: 'done', viewerTookPart: false }),
        ],
        now
    );
    expect(layout.threadChatIds).toEqual(['work-new', 'work-old', 'talk-new', 'talk-old']);
});

test('the sidebar leaves out conversations the viewer never touched, and expired rows', () => {
    const layout = sidebarOpenThreads(
        [
            row('untouched-recent', { state: 'recent', viewerTookPart: false }),
            row('untouched-unread', { group: 'with-you', state: 'unread', viewerTookPart: false }),
            row('expired', { expiresAt: '2026-11-05T11:00:00.000Z' }),
            row('mine', {}),
        ],
        now
    );
    expect(layout).toEqual({ hiddenCount: 0, threadChatIds: ['mine'] });
});

test('the sidebar folds past twelve rows but never folds a With you row', () => {
    const talks = Array.from({ length: 13 }, (_, index) => row(`t${index}`, {}));
    expect(sidebarOpenThreads(talks, now)).toMatchObject({ hiddenCount: 1 });

    const withYou = Array.from({ length: 14 }, (_, index) =>
        row(`y${index}`, { group: 'with-you', state: 'unread' })
    );
    const layout = sidebarOpenThreads([...withYou, row('a', {})], now);
    expect(layout.threadChatIds).toHaveLength(14);
    expect(layout.hiddenCount).toBe(1);
});
