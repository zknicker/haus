import { REMINDER_HISTORY_RETENTION_DAYS } from '@haus/api';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AuthorReminder } from '../reminders/reminders.ts';
import { listReminderFires, listReminders } from '../reminders/reminders.ts';

const reminderLogWindows = [
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
] as const;
type ReminderLogWindowLabel = (typeof reminderLogWindows)[number][0];

export async function readAgentReminderLog(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { id?: string; limit: number }
) {
    const reminders = input.id
        ? [await visibleOwnedReminder(db, runner, input.id)]
        : await listReminders(db, {
              actor: { agentId: runner.agentId, kind: 'agent' },
              serverId: runner.serverId,
          });
    const now = Date.now();
    // Matches the longest summary window and what retention sweep keeps anyway.
    const since = new Date(now - REMINDER_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const fires = (
        await Promise.all(
            reminders.map((reminder) =>
                listReminderFires(db, {
                    actor: { agentId: runner.agentId, kind: 'agent' },
                    reminderId: reminder.id,
                    serverId: runner.serverId,
                    since,
                })
            )
        )
    )
        .flat()
        .sort((left, right) => right.firedAt.localeCompare(left.firedAt));
    return {
        runs: fires.slice(0, input.limit).map((fire) => ({
            durationMs: fire.durationMs ?? null,
            firedAt: fire.firedAt,
            id: fire.id,
            // Null means the Computer has not settled this script fire yet,
            // not that it already woke the Agent: never guess `woke` for it.
            outcome: fire.outcome ?? 'not_reported',
            output: fire.scriptOutput ?? null,
            reminderId: fire.reminderId,
            scriptExitCode: fire.scriptExitCode ?? null,
        })),
        summary: Object.fromEntries(
            reminderLogWindows.map(([label, windowMs]) => [
                label,
                summarizeReminderLogWindow(
                    fires.filter((fire) => now - Date.parse(fire.firedAt) <= windowMs)
                ),
            ])
        ) as Record<ReminderLogWindowLabel, ReturnType<typeof summarizeReminderLogWindow>>,
    };
}

function summarizeReminderLogWindow(
    fires: { outcome?: string | null; wakeTotalTokens?: number | null }[]
) {
    const counts = { failed: 0, notReported: 0, quiet: 0, recovered: 0, unchanged: 0, woke: 0 };
    let tokens = 0;
    for (const fire of fires) {
        const key = reminderLogSummaryKey(fire.outcome);
        if (key in counts) {
            counts[key as keyof typeof counts] += 1;
        }
        tokens += fire.wakeTotalTokens ?? 0;
    }
    return { ...counts, runs: fires.length, tokens };
}

/** Never folded into `woke`: the Computer hasn't settled this fire yet. */
function reminderLogSummaryKey(outcome: string | null | undefined): string {
    return outcome == null || outcome === 'not_reported' ? 'notReported' : outcome;
}

async function visibleOwnedReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    id: string
): Promise<AuthorReminder> {
    const reminders = await listReminders(db, {
        actor: { agentId: runner.agentId, kind: 'agent' },
        serverId: runner.serverId,
    });
    const reminder = reminders.find((candidate) => candidate.id === id);
    if (!reminder) {
        throw new Error('The reminder is not owned by this Agent.');
    }
    return reminder;
}
