import * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { formatUtcTime } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { describeCadence, formatZonedFire } from './reminder-cadence-label.ts';

export interface ReminderDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

// The reminder rows the Agent API returns, and how the CLI prints them.

export const reminderViewSchema = z.object({
    anchorTarget: z.string(),
    // A Server older than the title/description split omits it; the Computer ships separately.
    description: z.string().nullable().default(null),
    // A Server older than wake rules omits these; they default to disabled.
    failAfter: z.number().int().positive().nullable().default(null),
    fireAt: z.string(),
    id: z.string(),
    repeat: z.string().nullable(),
    script: z.boolean(),
    status: z.string(),
    title: z.string(),
    version: z.number().int().positive(),
    timezone: z.string().optional(),
    wakeOnChange: z.boolean().default(false),
});

export const reminderSingleSchema = z.object({
    reminder: reminderViewSchema,
    replayed: z.boolean().default(false),
});
export const reminderListSchema = z.object({ reminders: z.array(reminderViewSchema) });

const reminderLogWindowSchema = z.object({
    failed: z.number().int().nonnegative(),
    quiet: z.number().int().nonnegative(),
    recovered: z.number().int().nonnegative(),
    runs: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    woke: z.number().int().nonnegative(),
});

export const reminderLogSchema = z.object({
    runs: z.array(
        z.object({
            durationMs: z.number().int().nullable().default(null),
            firedAt: z.string(),
            id: z.string(),
            outcome: z.string(),
            output: z.string().nullable(),
            reminderId: z.string(),
            scriptExitCode: z.number().nullable(),
        })
    ),
    // Omitted by a Server older than wake rules.
    summary: z
        .object({
            '24h': reminderLogWindowSchema,
            '7d': reminderLogWindowSchema,
            '30d': reminderLogWindowSchema,
        })
        .optional(),
});

/**
 * One reminder as a receipt the Agent can restate: the cadence with the zone it
 * recurs in, then the next fire as wall clock in that zone.
 */
export function describeReminder(reminder: z.infer<typeof reminderViewSchema>): string {
    const script = reminder.script ? ` (script${wakeRulesSuffix(reminder)})` : '';
    const description =
        reminder.description && reminder.description !== reminder.title
            ? ` — ${clip(reminder.description)}`
            : '';
    const fire = reminder.timezone
        ? formatZonedFire(reminder.fireAt, reminder.timezone)
        : formatUtcTime(reminder.fireAt);
    const timing = reminder.repeat
        ? `${describeCadence(reminder.repeat, reminder.timezone)}; next fire ${fire}`
        : `fires ${fire}`;
    return `${reminder.id} [${reminder.status}] "${reminder.title}"${description} — ${timing}${script}, anchored in ${reminder.anchorTarget}`;
}

/** Says which wake rules are in effect, for a script reminder's receipt. */
function wakeRulesSuffix(reminder: z.infer<typeof reminderViewSchema>): string {
    const rules = [
        reminder.wakeOnChange ? 'wakes on change' : null,
        reminder.failAfter ? `wakes after ${reminder.failAfter} failures` : null,
    ].filter((rule) => rule !== null);
    return rules.length > 0 ? ` · ${rules.join(', ')}` : '';
}

export function normalizeClearable(value: string | undefined): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    return value === 'none' ? null : value;
}

export function requireFlag(args: ParsedArgs, name: string): string {
    const value = args.values[name];
    if (!value) {
        throw new AgentCliError('INVALID_ARG', `Provide ${name}.`);
    }
    return value;
}

export function clip(value: string): string {
    const flat = value.replaceAll(/\s+/gu, ' ').trim();
    return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

export async function readReminderForMutation(deps: { client: AgentApiRequester }, id: string) {
    const response = await deps.client.request('/api/agent/reminders', reminderListSchema, {
        method: 'GET',
    });
    const reminder = response.reminders.find((candidate) => candidate.id === id);
    if (!reminder) {
        throw new AgentCliError('INVALID_ARG', 'The reminder is not owned by this Agent.');
    }
    return reminder;
}
