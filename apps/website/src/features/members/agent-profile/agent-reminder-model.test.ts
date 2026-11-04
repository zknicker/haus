import { expect, test } from 'bun:test';
import type { Reminder, ReminderHistoryEntry } from '@haus/api';
import {
    formatReminderRunDelay,
    formatReminderRunDetail,
    formatReminderRunSummaryLine,
    reminderDescription,
    reminderExecutionOutcome,
    reminderOutcomeBadge,
    reminderWakeRulesLabel,
    resolveReminderDetail,
    scheduledReminders,
    summarizeReminderRuns,
} from './agent-reminder-model.ts';

function reminder(overrides: Partial<Reminder> & Pick<Reminder, 'id'>): Reminder {
    return {
        anchorChatId: 'chat_1',
        anchorMessageId: 'msg_1',
        createdAt: '2026-09-01T00:00:00.000Z',
        description: null,
        failAfter: null,
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
        wakeOnChange: false,
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

function script(
    overrides: Partial<NonNullable<ReminderHistoryEntry['script']>>
): NonNullable<ReminderHistoryEntry['script']> {
    return { durationMs: null, exitCode: null, outcome: null, timedOut: false, ...overrides };
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

test('a script with no recorded wake-rule outcome falls back to its exit, with success and failure meaning what they say', () => {
    expect(reminderExecutionOutcome(execution({ script: script({ exitCode: 0 }) }))).toEqual({
        color: 'success',
        kind: 'script',
        label: 'Exit 0',
    });
    expect(reminderExecutionOutcome(execution({ script: script({ exitCode: 2 }) }))).toEqual({
        color: 'danger',
        kind: 'script',
        label: 'Exit 2',
    });
    expect(reminderExecutionOutcome(execution({ script: script({ timedOut: true }) }))).toEqual({
        color: 'danger',
        kind: 'script',
        label: 'Timed out',
    });
});

test('a script the Computer never reported on is neither a success nor a failure', () => {
    expect(reminderExecutionOutcome(execution({ script: script({ exitCode: null }) }))).toEqual({
        color: 'default',
        kind: 'script',
        label: 'Not reported',
    });
});

test('a settled fire reports its own recorded wake-rule outcome, not a re-derived exit label', () => {
    expect(
        reminderExecutionOutcome(execution({ script: script({ exitCode: 1, outcome: 'failed' }) }))
    ).toEqual({ color: 'warning', kind: 'script', label: 'Failing (quiet)' });
    expect(
        reminderExecutionOutcome(
            execution({ script: script({ exitCode: 0, outcome: 'unchanged' }) })
        )
    ).toEqual({ color: 'default', kind: 'script', label: 'Unchanged' });
    expect(
        reminderExecutionOutcome(
            execution({ script: script({ exitCode: 0, outcome: 'recovered' }) })
        )
    ).toEqual({ color: 'success', kind: 'script', label: 'Recovered' });
});

test('a scripted execution reports the script even when it also has an answer', () => {
    const outcome = reminderExecutionOutcome(
        execution({
            answer: { chatId: 'chat_1', messageId: 'msg_2' },
            script: script({ exitCode: 0, outcome: 'woke' }),
        })
    );

    expect(outcome).toEqual({ color: 'success', kind: 'script', label: 'Woke' });
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

test('the detail resolves against the live schedule and closes when its reminder leaves', () => {
    const scheduled = [reminder({ id: 'r1' }), reminder({ id: 'r2' })];
    expect(resolveReminderDetail('r2', scheduled)?.id).toBe('r2');
    expect(resolveReminderDetail('r3', scheduled)).toBeNull();
    expect(resolveReminderDetail(null, scheduled)).toBeNull();
});

test('a run states its delay only when it woke meaningfully late', () => {
    const run = (late: number) => ({
        firedAt: new Date(Date.parse('2026-09-02T09:00:00.000Z') + late).toISOString(),
        scheduledFor: '2026-09-02T09:00:00.000Z',
    });
    expect(formatReminderRunDelay(run(30_000))).toBeNull();
    expect(formatReminderRunDelay(run(5 * 60_000))).toBe('5m late');
    expect(formatReminderRunDelay(run(3 * 3_600_000))).toBe('3h late');
    expect(formatReminderRunDelay(run(72 * 3_600_000))).toBe('3d late');
});

test('the wake rules in effect name only the flags actually set', () => {
    expect(reminderWakeRulesLabel(reminder({ id: 'r1' }))).toBeNull();
    expect(reminderWakeRulesLabel(reminder({ id: 'r2', wakeOnChange: true }))).toBe(
        'Wakes on change'
    );
    expect(reminderWakeRulesLabel(reminder({ id: 'r3', failAfter: 3 }))).toBe(
        'Wakes after 3 failures'
    );
    expect(reminderWakeRulesLabel(reminder({ failAfter: 3, id: 'r4', wakeOnChange: true }))).toBe(
        'Wakes on change · Wakes after 3 failures'
    );
});

test('a run states its duration and exit code, in that order, and neither when absent', () => {
    expect(formatReminderRunDetail({ durationMs: 842, outcome: 'woke', scriptExitCode: 0 })).toBe(
        '842ms · exit 0'
    );
    expect(
        formatReminderRunDetail({ durationMs: null, outcome: 'woke', scriptExitCode: null })
    ).toBeNull();
    expect(formatReminderRunDetail({ durationMs: 50, outcome: null, scriptExitCode: null })).toBe(
        '50ms'
    );
});

test('a chip exists for every recorded outcome and for none of the rest', () => {
    expect(reminderOutcomeBadge('woke')?.label).toBe('Woke');
    expect(reminderOutcomeBadge('failed')?.label).toBe('Failing (quiet)');
    expect(reminderOutcomeBadge('recovered')?.label).toBe('Recovered');
    expect(reminderOutcomeBadge('unchanged')?.label).toBe('Unchanged');
    expect(reminderOutcomeBadge('quiet')?.label).toBe('Quiet');
    expect(reminderOutcomeBadge(null)).toBeNull();
});

test('summarizing runs counts each outcome once and totals tokens spent on wakes', () => {
    const { counts, tokens } = summarizeReminderRuns([
        { outcome: 'woke', wakeTotalTokens: 100 },
        { outcome: 'woke', wakeTotalTokens: 50 },
        { outcome: 'failed', wakeTotalTokens: null },
        { outcome: 'recovered', wakeTotalTokens: 30 },
        { outcome: null, wakeTotalTokens: null },
    ]);

    expect(counts).toEqual({ failed: 1, quiet: 0, recovered: 1, unchanged: 0, woke: 2 });
    expect(tokens).toBe(180);
});

test('the run-history summary line leads with the latest outcome, then totals', () => {
    expect(
        formatReminderRunSummaryLine([
            { outcome: 'unchanged', wakeTotalTokens: null },
            { outcome: 'woke', wakeTotalTokens: 40 },
        ])
    ).toBe(
        'Last run: Unchanged · 1 woke, 0 failed, 0 recovered, 1 unchanged, 0 quiet · 40 tokens on wakes'
    );
    expect(formatReminderRunSummaryLine([])).toBeNull();
});
