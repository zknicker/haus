import { expect, test } from 'bun:test';
import type { AgentTurnOperationCount } from '@haus/api';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import {
    formatTurnDuration,
    formatTurnOutcome,
    getTurnRowStatus,
    groupTurnRowsByDay,
    resolveTurnRowTitle,
    turnChatActionLabel,
} from './agent-turn-row-model.ts';

type SettledTurn = Extract<AgentActivityTurn, { kind: 'settled' }>;

const chats = new Map([
    ['cht_dm', { kind: 'dm' as const, name: 'Tiny' }],
    ['cht_product', { kind: 'channel' as const, name: 'product' }],
]);
const dmMessage = {
    author: 'human',
    chatId: 'cht_dm',
    kind: 'message',
    messageId: 'msg_one',
    preview: null,
} as const;

test('a message turn is titled by its first line, with a DM labeled "DM", never the peer', () => {
    const trigger = quoting(dmMessage, '**Set up** a project\nin tinylink');
    expect(resolveTurnRowTitle(trigger, chats)).toEqual({
        kind: 'text',
        place: 'DM',
        text: 'Set up a project in tinylink',
    });
    expect(resolveTurnRowTitle({ ...trigger, chatId: 'cht_product' }, chats)).toMatchObject({
        place: '#product',
    });
});

test('a message turn title is plain text, never escaped Markdown', () => {
    const trigger = quoting(
        dmMessage,
        '**Run** sleep 20 \\&\\& echo hi per [the doc](https://haus.dev)'
    );
    expect(resolveTurnRowTitle(trigger, chats)).toMatchObject({
        text: 'Run sleep 20 && echo hi per the doc',
    });
});

test('a message that is gone leaves the title absent', () => {
    expect(resolveTurnRowTitle(dmMessage, chats)).toEqual({ kind: 'none' });
});

test('private and unrecorded triggers show nothing; typed work names itself', () => {
    expect(resolveTurnRowTitle({ kind: 'private' }, chats)).toEqual({ kind: 'none' });
    expect(resolveTurnRowTitle(null, chats)).toEqual({ kind: 'none' });
    expect(resolveTurnRowTitle({ chatId: 'cht_product', kind: 'reminder' }, chats)).toEqual({
        kind: 'text',
        place: '#product',
        text: 'Reminder',
    });
    // A Chat outside the reader's list (a Thread) loses its place, not its title.
    expect(resolveTurnRowTitle({ chatId: 'cht_thread', kind: 'trigger' }, chats)).toEqual({
        kind: 'text',
        place: null,
        text: 'Trigger',
    });
});

test('a task turn reads its task message, and an attachment-only message says so', () => {
    const task = {
        chatId: 'cht_dm',
        kind: 'task',
        messageId: 'msg_task',
        preview: { attachmentCount: 1, content: '' },
    } as const;
    expect(resolveTurnRowTitle(task, chats)).toMatchObject({ text: 'Attachment' });
});

test('the outcome says what the turn did in words, most telling first', () => {
    const turn = settled({
        messageCount: 1,
        operations: [
            op('running_command', 4, 1),
            op('editing_files', 3),
            op('generating_video', 2),
            op('generating_image', 1),
            op('delegating', 2),
        ],
    });
    expect(formatTurnOutcome(turn)).toBe(
        'Ran 2 sub-agents · generated 1 image · generated 2 videos · edited 3 files · ran 4 commands (1 failed) · sent 1 message'
    );
    // A noun the previous action named is not repeated; a one-off repeat needs no count.
    expect(
        formatTurnOutcome(
            settled({
                messageCount: 0,
                operations: [
                    op('reading_files', 4),
                    op('editing_files', 3),
                    op('checking_messages', 2),
                ],
            })
        )
    ).toBe('Edited 3 files · read 4 · checked messages 2 times');
    expect(
        formatTurnOutcome(settled({ messageCount: 0, operations: [op('searching_web', 1)] }))
    ).toBe('Searched the web');
    // Nothing done and nothing said: a completed turn chose quiet; any other ended early.
    expect(formatTurnOutcome(settled())).toBe('Stayed quiet');
    expect(formatTurnOutcome({ ...settled(), status: 'interrupted' })).toBe(
        'Ended before any action'
    );
    expect(formatTurnOutcome({ ...settled(), failureKind: 'timeout', status: 'failed' })).toBe(
        'Timed out'
    );
    // An unknown reason never repeats the row's own "Failed" mark.
    expect(formatTurnOutcome({ ...settled(), failureKind: 'mystery', status: 'failed' })).toBe(
        'Ended before any action'
    );
});

test('a completed row carries no status; failures carry their folded count', () => {
    expect(getTurnRowStatus({ count: 1, latest: settled(), since: at(0) })).toBeNull();
    expect(
        getTurnRowStatus({
            count: 5,
            latest: { ...settled(), status: 'failed' },
            since: at(0),
        })
    ).toEqual({ count: 5, kind: 'failed' });
    expect(
        getTurnRowStatus({ count: 1, latest: { ...settled(), kind: 'active' }, since: at(0) })
    ).toEqual({ kind: 'working' });
});

test('rows group under Today, Yesterday, then a short date', () => {
    const now = new Date(2026, 9, 6, 15).getTime();
    const row = (date: Date) => ({
        count: 1,
        latest: settled({ startedAt: date.toISOString() }),
        since: date.toISOString(),
    });
    const groups = groupTurnRowsByDay(
        [
            row(new Date(2026, 9, 6, 14)),
            row(new Date(2026, 9, 6, 9)),
            row(new Date(2026, 9, 5, 22)),
            row(new Date(2026, 9, 2, 8)),
            row(new Date(2025, 11, 30, 8)),
        ],
        now
    );
    expect(groups.map((group) => [group.label, group.rows.length])).toEqual([
        ['Today', 2],
        ['Yesterday', 1],
        ['Oct 2', 1],
        ['Dec 30, 2025', 1],
    ]);
});

test('durations stay short enough for a fixed column', () => {
    expect(formatTurnDuration(0)).toBe('<1s');
    expect(formatTurnDuration(999)).toBe('<1s');
    expect(formatTurnDuration(-5)).toBe('<1s');
    expect(formatTurnDuration(42_400)).toBe('42s');
    expect(formatTurnDuration(84_000)).toBe('1m 24s');
    // Zero minor units drop: the "11m 00s" that wrapped the column reads "11m".
    expect(formatTurnDuration(660_000)).toBe('11m');
    expect(formatTurnDuration(59_600)).toBe('1m');
    expect(formatTurnDuration(3_599_600)).toBe('1h');
    expect(formatTurnDuration(3_720_000)).toBe('1h 2m');
    expect(formatTurnDuration(Number.NaN)).toBe('—');
});

function op(
    category: AgentTurnOperationCount['category'],
    completed: number,
    failed = 0
): AgentTurnOperationCount {
    return { category, completed: completed - failed, failed, interrupted: 0 };
}

function quoting(trigger: typeof dmMessage, content: string) {
    return { ...trigger, preview: { attachmentCount: 0, content } };
}

function at(minute: number) {
    return new Date(Date.UTC(2026, 9, 6, 12, minute)).toISOString();
}

function settled(overrides: Partial<SettledTurn> = {}): SettledTurn {
    return {
        durationMs: 60_000,
        endedAt: at(1),
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 0,
        operationCount: 0,
        operations: [],
        outputProduced: true,
        runId: 'run_one',
        startedAt: at(0),
        status: 'completed',
        trigger: null,
        ...overrides,
    };
}

test('the open row names its Chat, and a DM names the Agent it is with', () => {
    expect(turnChatActionLabel('#product', 'Tiny')).toBe('View in #product');
    expect(turnChatActionLabel('DM', 'Tiny')).toBe('View in DM with Tiny');
});
