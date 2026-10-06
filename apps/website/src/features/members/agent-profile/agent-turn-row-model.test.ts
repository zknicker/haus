import { expect, test } from 'bun:test';
import type { AgentTurnOperationCount, ChatMessage } from '@haus/api';
import type { TurnTriggerMessage } from '../../../hooks/members/use-turn-trigger-messages.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import {
    formatTurnDuration,
    formatTurnOutcome,
    getTurnRowStatus,
    groupTurnRowsByDay,
    resolveTurnRowTitle,
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
} as const;

test('a message turn is titled by its first line, with a DM labeled "DM", never the peer', () => {
    const messages = reads(['msg_one', resolved('**Set up** a project\nin tinylink')]);
    expect(resolveTurnRowTitle(dmMessage, messages, chats)).toEqual({
        kind: 'text',
        place: 'DM',
        text: 'Set up a project in tinylink',
    });
    expect(
        resolveTurnRowTitle({ ...dmMessage, chatId: 'cht_product' }, messages, chats)
    ).toMatchObject({ place: '#product' });
});

test('a title stays blank while its message reads, and is absent when unreadable', () => {
    expect(resolveTurnRowTitle(dmMessage, reads(), chats)).toEqual({
        kind: 'pending',
        place: 'DM',
    });
    expect(
        resolveTurnRowTitle(dmMessage, reads(['msg_one', { status: 'unreadable' }]), chats)
    ).toEqual({ kind: 'none' });
});

test('private and unrecorded triggers show nothing; typed work names itself', () => {
    expect(resolveTurnRowTitle({ kind: 'private' }, reads(), chats)).toEqual({ kind: 'none' });
    expect(resolveTurnRowTitle(null, reads(), chats)).toEqual({ kind: 'none' });
    expect(
        resolveTurnRowTitle({ chatId: 'cht_product', kind: 'reminder' }, reads(), chats)
    ).toEqual({ kind: 'text', place: '#product', text: 'Reminder' });
    // A Chat outside the reader's list (a Thread) loses its place, not its title.
    expect(resolveTurnRowTitle({ chatId: 'cht_thread', kind: 'trigger' }, reads(), chats)).toEqual({
        kind: 'text',
        place: null,
        text: 'Trigger',
    });
});

test('a task turn reads its task message, and an attachment-only message says so', () => {
    const task = { chatId: 'cht_dm', kind: 'task', messageId: 'msg_task' } as const;
    expect(resolveTurnRowTitle(task, reads(['msg_task', resolved('', 1)]), chats)).toMatchObject({
        text: 'Attachment',
    });
});

test('the outcome lists actions taken, most telling first, with no invented count', () => {
    const turn = settled({
        messageCount: 1,
        operations: [
            op('running_command', 4, 1),
            op('editing_files', 3),
            op('generating_media', 1),
            op('delegating', 2),
        ],
    });
    expect(formatTurnOutcome(turn)).toBe(
        '2 sub-agents · 1 image or video · 3 file edits · 4 commands (1 failed) · 1 message'
    );
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

test('durations read at a glance in a fixed column', () => {
    expect(formatTurnDuration(42_400)).toBe('42s');
    expect(formatTurnDuration(185_000)).toBe('3m 05s');
    expect(formatTurnDuration(3_720_000)).toBe('1h 02m');
});

function op(
    category: AgentTurnOperationCount['category'],
    completed: number,
    failed = 0
): AgentTurnOperationCount {
    return { category, completed: completed - failed, failed, interrupted: 0 };
}

function reads(...entries: [string, TurnTriggerMessage][]) {
    return new Map(entries);
}

function resolved(content: string, attachments = 0): TurnTriggerMessage {
    return {
        message: {
            attachments: Array.from({ length: attachments }, () => ({})),
            content,
        } as unknown as ChatMessage,
        status: 'resolved',
    };
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
