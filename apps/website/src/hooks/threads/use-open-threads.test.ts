import { expect, test } from 'bun:test';
import type { OpenThread } from '@haus/api';
import { sidebarOpenThreads, sortOpenThreads } from './use-open-threads.ts';

const now = new Date('2026-11-05T12:00:00.000Z');

function thread(id: string, group: OpenThread['group'], expiresAt: string | null = null) {
    return { expiresAt, group, threadChatId: id } as OpenThread;
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
    expect(sorted.map((row) => row.threadChatId)).toEqual([
        'you-new',
        'you-old',
        'agents',
        'recent',
    ]);
});

test('the sidebar folds past twelve rows but never folds a With you row', () => {
    const agents = Array.from({ length: 13 }, (_, index) => thread(`a${index}`, 'with-agents'));
    expect(sidebarOpenThreads(agents)).toMatchObject({ hiddenCount: 1 });

    const withYou = Array.from({ length: 14 }, (_, index) => thread(`y${index}`, 'with-you'));
    const layout = sidebarOpenThreads([...withYou, thread('a', 'with-agents')]);
    expect(layout.threadChatIds).toHaveLength(14);
    expect(layout.hiddenCount).toBe(1);
});
