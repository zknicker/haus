import type * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';
import { formatUtcTime } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { clip, type ReminderDeps, reminderLogSchema } from './agent-reminder-view.ts';

// Two opt-in wake rules cut noise from a script reminder's own ticks:
// `--wake-on-change` skips a wake whose output repeats the last one that woke
// you, and `--fail-after <n>` holds a failing script quiet until its Nth
// consecutive failure, then wakes once more on recovery. Neither changes
// behavior unless set (specs/reminders.md).
export const wakeOnChangeFlag = {
    description: "Wake only when the script's output differs from the output that last woke you",
    name: '--wake-on-change',
};
export const failAfterFlag = {
    description:
        'Wake once after this many consecutive script failures, then quiet until it wakes again',
    name: '--fail-after',
    valueName: '<n>',
};

/** Both wake-rule flags presuppose a script to judge, so neither means anything without one. */
export function requireScriptForWakeRules(args: ParsedArgs): void {
    const hasWakeRule =
        args.flags['--wake-on-change'] === true || args.values['--fail-after'] !== undefined;
    if (hasWakeRule && !args.values['--script']) {
        throw new AgentCliError(
            'INVALID_ARG',
            '--wake-on-change and --fail-after only apply to a script reminder.',
            { nextAction: 'Add --script, or drop these flags.' }
        );
    }
}

export function parseFailAfter(raw: string | undefined): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new AgentCliError('INVALID_ARG', '--fail-after must be an integer between 1 and 20.');
    }
    return value;
}

export function normalizeFailAfter(raw: string | undefined): number | null | undefined {
    if (raw === undefined) {
        return undefined;
    }
    return raw === 'none' ? null : parseFailAfter(raw);
}

/** `haus reminder log`: per-run rows, including quiet script ticks, plus the Server's summary. */
export async function runReminderLog(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const params = new URLSearchParams();
    const id = args.values['--id'];
    const limit = args.values['--limit'];
    if (id) {
        params.set('id', id);
    }
    if (limit) {
        params.set('limit', limit);
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await deps.client.request(
        `/api/agent/reminders/log${query}`,
        reminderLogSchema,
        { method: 'GET' }
    );
    const summary = response.summary ? `${formatReminderLogSummary(response.summary)}\n` : '';
    if (response.runs.length === 0) {
        deps.write(`${summary}No reminder fires recorded yet.\n`);
        return 0;
    }
    const lines = response.runs.map((run) => {
        const exit = run.scriptExitCode === null ? '' : ` exit=${run.scriptExitCode}`;
        const duration = run.durationMs === null ? '' : ` ${run.durationMs}ms`;
        const output = run.output ? ` — ${clip(run.output)}` : '';
        return `${formatUtcTime(run.firedAt)} ${run.reminderId} [${run.outcome}]${exit}${duration}${output}`;
    });
    deps.write(`${summary}${lines.join('\n')}\n`);
    return 0;
}

function formatReminderLogSummary(
    summary: NonNullable<z.infer<typeof reminderLogSchema>['summary']>
): string {
    const windows: [string, keyof typeof summary][] = [
        ['24h', '24h'],
        ['7d', '7d'],
        ['30d', '30d'],
    ];
    return windows
        .map(([label, key]) => {
            const window = summary[key];
            return `${label}: ${window.runs} runs (${window.quiet} quiet, ${window.unchanged} unchanged, ${window.woke} woke, ${window.failed} failed, ${window.recovered} recovered) · ${window.tokens} tokens on wakes`;
        })
        .join('\n');
}
