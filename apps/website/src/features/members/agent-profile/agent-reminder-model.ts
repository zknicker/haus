import type { Reminder, ReminderHistoryEntry, ReminderRunOutcome } from '@haus/api';

/**
 * The section is a schedule, so it renders only the wakes still coming. The
 * Server sorts every row by `fireAt` ascending, which puts long-settled rows
 * above the next wake; filtering here keeps that order meaningful without
 * resorting it.
 *
 * What has already happened is not a settled reminder but an execution, and it
 * lives in the History drawer, which reads `reminder.history` instead.
 */
export function scheduledReminders(reminders: readonly Reminder[]): Reminder[] {
    return reminders.filter((reminder) => reminder.status === 'scheduled');
}

/**
 * The detail sheet opens by id and resolves against the schedule the section
 * renders, so a reminder that is canceled, fires its one run, or leaves the
 * list any other way closes the sheet without a second piece of state.
 */
export function resolveReminderDetail(
    reminderId: string | null,
    scheduled: readonly Reminder[]
): Reminder | null {
    return reminderId ? (scheduled.find((reminder) => reminder.id === reminderId) ?? null) : null;
}

/**
 * The detail's Instructions: what the short title stands for. A Reminder
 * written before the split copied its title here, so an identical one is said
 * once — by the title.
 */
export function reminderDescription(reminder: Pick<Reminder, 'description' | 'title'>) {
    const description = reminder.description?.trim();
    return description && description !== reminder.title.trim() ? description : null;
}

export function formatReminderTime(value: string, timeZone: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
    }).format(new Date(value));
}

/**
 * How late one run woke, when it was late enough to matter — a wake that waited
 * for an offline Agent. On-time runs say nothing, so the column stays quiet.
 */
export function formatReminderRunDelay(run: { firedAt: string; scheduledFor: string }) {
    const minutes = Math.floor((Date.parse(run.firedAt) - Date.parse(run.scheduledFor)) / 60_000);
    if (minutes < 2) {
        return null;
    }
    if (minutes < 60) {
        return `${minutes}m late`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 48 ? `${hours}h late` : `${Math.floor(hours / 24)}d late`;
}

/** What one execution produced, as the History drawer's outcome cell renders it. */
export type ReminderExecutionOutcome =
    | { color: 'danger' | 'default' | 'success' | 'warning'; kind: 'script'; label: string }
    | { kind: 'note'; label: string }
    | null;

/**
 * An execution says one thing about itself, not two. A reminder that carried a
 * script reports the script; that is the outcome the operator came for, and the
 * answer is already stated by the Answer column's link. A reminder without a
 * script has only its answer to report, so it stays blank when the link says
 * "Open" and names the silence when there is no link to say it.
 *
 * Silence is a real ending rather than a pending one: a fire the Agent had
 * nothing to add to leaves the conversation untouched and is never revisited,
 * so this reads "No answer" rather than "Awaiting answer".
 */
export function reminderExecutionOutcome(
    entry: Pick<ReminderHistoryEntry, 'answer' | 'script'>
): ReminderExecutionOutcome {
    if (entry.script) {
        const badge = reminderOutcomeBadge(entry.script.outcome, {
            scriptExitCode: entry.script.exitCode,
        });
        return { ...badge, kind: 'script' };
    }
    return entry.answer ? null : { kind: 'note', label: 'No answer' };
}

/**
 * One run's wake-rule outcome, as every run-history surface (the History
 * drawer and a reminder's own Run history) renders its chip. `woke` from a
 * failure reaching `--fail-after` reads differently than `woke` from a
 * successful run, so the exit code decides its tone; everything else is a
 * fixed mapping. Null is treated the same as `not_reported`, for a payload
 * from before that outcome existed.
 */
export function reminderOutcomeBadge(
    outcome: ReminderRunOutcome | null,
    context: { scriptExitCode?: number | null } = {}
): { color: 'danger' | 'default' | 'success' | 'warning'; label: string } {
    switch (outcome) {
        case 'failed':
            return { color: 'warning', label: 'Failing' };
        case 'quiet':
            return { color: 'default', label: 'Quiet' };
        case 'recovered':
            return { color: 'success', label: 'Recovered' };
        case 'unchanged':
            return { color: 'default', label: 'Unchanged' };
        case 'woke':
            return context.scriptExitCode != null && context.scriptExitCode !== 0
                ? { color: 'warning', label: 'Woke · failing' }
                : { color: 'success', label: 'Woke' };
        default:
            return { color: 'default', label: 'Not reported' };
    }
}

/** The wake rules in effect for a script reminder, or null while neither is set. */
export function reminderWakeRulesLabel(reminder: Pick<Reminder, 'failAfter' | 'wakeOnChange'>) {
    const rules = [
        reminder.wakeOnChange ? 'Wakes on change' : null,
        reminder.failAfter ? `Wakes after ${reminder.failAfter} failures` : null,
    ].filter((rule): rule is string => rule !== null);
    return rules.length > 0 ? rules.join(' · ') : null;
}

export interface ReminderRunLike {
    durationMs?: number | null;
    outcome: ReminderRunOutcome | null;
    scriptExitCode?: number | null;
    wakeTotalTokens?: number | null;
}

/** A whole number of tokens, the way a person would say it: "65,697". */
export function formatReminderTokenCount(value: number): string {
    return new Intl.NumberFormat().format(value);
}

/** A script run's duration in tenths of a second: "1.0s", "30.1s". */
export function formatReminderRunDuration(durationMs: number): string {
    return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * How long a run took, how it exited, and — for a run that woke — the
 * tokens that wake cost, as the compact run-history row's second line.
 */
export function formatReminderRunDetail(run: ReminderRunLike): string | null {
    const parts = [
        run.durationMs != null ? formatReminderRunDuration(run.durationMs) : null,
        run.scriptExitCode != null ? `exit ${run.scriptExitCode}` : null,
        run.wakeTotalTokens ? `${formatReminderTokenCount(run.wakeTotalTokens)} tokens` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
}

/** Counts by outcome, and tokens spent on wakes, over whatever runs the caller fetched. */
export function summarizeReminderRuns(runs: readonly ReminderRunLike[]) {
    const counts: Record<ReminderRunOutcome, number> = {
        failed: 0,
        not_reported: 0,
        quiet: 0,
        recovered: 0,
        unchanged: 0,
        woke: 0,
    };
    let tokens = 0;
    for (const run of runs) {
        const outcome = run.outcome ?? 'not_reported';
        counts[outcome] += 1;
        tokens += run.wakeTotalTokens ?? 0;
    }
    return { counts, tokens };
}

/**
 * The Run history group's one summary line: the most recent run's outcome,
 * then totals across every run the caller fetched. `runs` is newest first.
 */
export function formatReminderRunSummaryLine(runs: readonly ReminderRunLike[]): string | null {
    if (runs.length === 0) {
        return null;
    }
    const latest = reminderOutcomeBadge(runs[0].outcome, {
        scriptExitCode: runs[0].scriptExitCode,
    });
    const { counts, tokens } = summarizeReminderRuns(runs);
    const totals = `${counts.woke} woke, ${counts.failed} failed, ${counts.recovered} recovered, ${counts.unchanged} unchanged, ${counts.quiet} quiet, ${counts.not_reported} not reported`;
    const tokenNote = tokens > 0 ? ` · ${formatReminderTokenCount(tokens)} tokens on wakes` : '';
    return `Last run: ${latest.label} · ${totals}${tokenNote}`;
}
