import { expect, test } from 'bun:test';
import type { Reminder, ReminderHistoryEntry } from '@haus/api';
import {
    formatReminderCadence,
    formatReminderSchedule,
    reminderDescription,
    reminderExecutionOutcome,
    scheduledReminders,
} from './agent-reminder-model.ts';

function reminder(overrides: Partial<Reminder> & Pick<Reminder, 'id'>): Reminder {
    return {
        anchorChatId: 'chat_1',
        anchorMessageId: 'msg_1',
        createdAt: '2026-09-01T00:00:00.000Z',
        description: null,
        fireAt: '2026-09-02T09:00:00.000Z',
        hasScript: false,
        ownerAgentId: 'agent_1',
        ownerHandle: 'cove',
        repeat: null,
        scriptBytes: 0,
        status: 'scheduled',
        timezone: 'UTC',
        title: 'Reminder',
        updatedAt: '2026-09-01T00:00:00.000Z',
        version: 1,
        ...overrides,
    };
}

function execution(overrides: Partial<ReminderHistoryEntry> = {}): ReminderHistoryEntry {
    return {
        answer: null,
        fireId: 'fire_1',
        firedAt: '2026-09-02T09:00:00.000Z',
        reminderId: 'rem_1',
        repeat: null,
        scheduledFor: '2026-09-02T09:00:00.000Z',
        script: null,
        title: 'Reminder',
        ...overrides,
    };
}

test('the schedule keeps only reminders that are still coming', () => {
    const scheduled = scheduledReminders([
        reminder({ id: 'r_fired', status: 'fired' }),
        reminder({ id: 'r_next' }),
        reminder({ id: 'r_canceled', status: 'canceled' }),
    ]);

    expect(scheduled.map((row) => row.id)).toEqual(['r_next']);
});

test('the schedule keeps the Server order rather than resorting it', () => {
    const scheduled = scheduledReminders([
        reminder({ fireAt: '2026-09-02T09:00:00.000Z', id: 'r_soon' }),
        reminder({ fireAt: '2026-09-09T09:00:00.000Z', id: 'r_later' }),
    ]);

    expect(scheduled.map((row) => row.id)).toEqual(['r_soon', 'r_later']);
});

test('filtering the schedule leaves the source snapshot untouched', () => {
    const rows = [reminder({ id: 'r_fired', status: 'fired' }), reminder({ id: 'r_next' })];

    scheduledReminders(rows);

    expect(rows.map((row) => row.id)).toEqual(['r_fired', 'r_next']);
});

test('a repeating reminder pairs its next wake with its cadence', () => {
    expect(
        formatReminderSchedule({ fireAt: '2026-09-02T09:00:00.000Z', repeat: 'daily@09:00' })
    ).toMatch(/ · daily@09:00$/);
});

test('a one-shot reminder says only when it wakes', () => {
    expect(
        formatReminderSchedule({ fireAt: '2026-09-02T09:00:00.000Z', repeat: null })
    ).not.toContain('·');
});

test('a one-shot execution still names a cadence rather than leaving the cell blank', () => {
    expect(formatReminderCadence(null)).toBe('Once');
    expect(formatReminderCadence('weekly:mon@09:00')).toBe('weekly:mon@09:00');
});

test('a script reports how it ended, with success and failure meaning what they say', () => {
    expect(
        reminderExecutionOutcome(execution({ script: { exitCode: 0, timedOut: false } }))
    ).toEqual({ color: 'success', kind: 'script', label: 'Exit 0' });
    expect(
        reminderExecutionOutcome(execution({ script: { exitCode: 2, timedOut: false } }))
    ).toEqual({ color: 'danger', kind: 'script', label: 'Exit 2' });
    expect(
        reminderExecutionOutcome(execution({ script: { exitCode: null, timedOut: true } }))
    ).toEqual({ color: 'danger', kind: 'script', label: 'Timed out' });
});

test('a script the Computer never reported on is neither a success nor a failure', () => {
    expect(
        reminderExecutionOutcome(execution({ script: { exitCode: null, timedOut: false } }))
    ).toEqual({ color: 'default', kind: 'script', label: 'Not reported' });
});

test('a scripted execution reports the script even when it also has an answer', () => {
    const outcome = reminderExecutionOutcome(
        execution({
            answer: { chatId: 'chat_1', messageId: 'msg_2' },
            script: { exitCode: 0, timedOut: false },
        })
    );

    expect(outcome).toEqual({ color: 'success', kind: 'script', label: 'Exit 0' });
});

test('an answered scriptless execution says nothing the Answer link already says', () => {
    expect(
        reminderExecutionOutcome(execution({ answer: { chatId: 'chat_1', messageId: 'msg_2' } }))
    ).toBeNull();
});

test('an unanswered execution names the silence, because no answer is an ending', () => {
    expect(reminderExecutionOutcome(execution())).toEqual({ kind: 'note', label: 'No answer' });
});

test('a scheduled row adds the description unless it only repeats the title', () => {
    expect(
        reminderDescription(
            reminder({ description: 'Check advertising and adjust bids', id: 'r1', title: 'Ads' })
        )
    ).toBe('Check advertising and adjust bids');
    expect(reminderDescription(reminder({ description: 'Reminder', id: 'r2' }))).toBeNull();
    expect(reminderDescription(reminder({ id: 'r3' }))).toBeNull();
});
