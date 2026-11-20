import { expect, test } from 'bun:test';
import type { PullRequestReading, TaskReminderRef } from '@haus/api';
import { pendingTaskReminders, pullRequestFacts, reminderLine } from './task-work-model.ts';

const reading = (url: string) =>
    ({
        additions: 3,
        changedFiles: 1,
        checks: 'passing',
        deletions: 1,
        review: 'approved',
        url,
    }) as PullRequestReading;

const reminder = (
    id: string,
    kind: TaskReminderRef['kind'],
    nextFireAt: null | string
): TaskReminderRef => ({
    anchorChatId: 'cht_task',
    kind,
    nextFireAt,
    reminderId: id,
    setBy: { agentId: 'agt_forge', displayName: 'Forge' },
    title: 'Check the deploy',
});

test('a pull request reads its checks, review, and size on one line', () => {
    expect(pullRequestFacts(reading('https://x.test/1'))).toBe(
        'Checks passing · Approved · 1 file'
    );
});

test('only pending one-time reminders show, soonest first', () => {
    const pending = pendingTaskReminders([
        reminder('r1', 'once', '2026-11-17T19:35:00Z'),
        reminder('r2', 'recurring', '2026-11-17T18:00:00Z'),
        reminder('r3', 'once', null),
        reminder('r4', 'once', '2026-11-17T18:00:00Z'),
    ]);
    expect(pending.map((entry) => entry.reminderId)).toEqual(['r4', 'r1']);
});

test('a reminder line names who checks back and when, with the day once it is not today', () => {
    const now = new Date(2026, 10, 17, 9, 0);
    const today = new Date(2026, 10, 17, 19, 35).toISOString();
    expect(reminderLine('Forge', today, now)).toMatch(/^Forge checks back at 7:35/u);
    const tomorrow = new Date(2026, 10, 18, 8, 5).toISOString();
    expect(reminderLine('Tiny', tomorrow, now)).toMatch(/^Tiny checks back at Wed 8:05/u);
});
