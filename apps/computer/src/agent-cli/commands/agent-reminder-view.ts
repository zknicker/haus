import * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';
import { formatLocalTime } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';

// The reminder rows the Agent API returns, and how the CLI prints them.

export const reminderViewSchema = z.object({
    anchorTarget: z.string(),
    // A Server older than the title/description split omits it; the Computer ships separately.
    description: z.string().nullable().default(null),
    fireAt: z.string(),
    id: z.string(),
    repeat: z.string().nullable(),
    script: z.boolean(),
    status: z.string(),
    title: z.string(),
    version: z.number().int().positive(),
});

export const reminderSingleSchema = z.object({ reminder: reminderViewSchema });
export const reminderListSchema = z.object({ reminders: z.array(reminderViewSchema) });
export const reminderLogSchema = z.object({
    runs: z.array(
        z.object({
            firedAt: z.string(),
            id: z.string(),
            outcome: z.string(),
            output: z.string().nullable(),
            reminderId: z.string(),
            scriptExitCode: z.number().nullable(),
        })
    ),
});

export function describeReminder(reminder: z.infer<typeof reminderViewSchema>): string {
    const repeat = reminder.repeat ? ` repeats ${reminder.repeat}` : '';
    const script = reminder.script ? ' (script)' : '';
    const description =
        reminder.description && reminder.description !== reminder.title
            ? ` — ${clip(reminder.description)}`
            : '';
    return `${reminder.id} [${reminder.status}] "${reminder.title}"${description} — fires ${formatLocalTime(reminder.fireAt)}${repeat}${script}, anchored in ${reminder.anchorTarget}`;
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
