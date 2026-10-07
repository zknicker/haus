import * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

export const titleHelp =
    'Short label shown in chat, like a calendar invite subject (e.g. "Monday Advertising Review"); max 60 chars';
export const descriptionHelp = 'What to do when it fires, in full; max 300 chars';
export const reminderTimezoneFlag = {
    description: 'Required IANA zone for calendar schedules; confirms the stored zone on updates',
    name: '--timezone',
    valueName: '<iana>',
};

/** Fail before mutation on old Servers that would silently discard this flag. */
export async function scheduleTimezone(args: ParsedArgs, client: AgentApiRequester) {
    const timezone = args.values['--timezone'];
    if (timezone === undefined) {
        if (/^(daily@|weekly:)/u.test(args.values['--repeat'] ?? '')) {
            throw new AgentCliError(
                'INVALID_ARG',
                'Calendar repeats require an explicit --timezone.',
                {
                    nextAction:
                        'Pass the agreed IANA zone with --timezone; the first-fire offset does not set recurrence timezone.',
                }
            );
        }
        return undefined;
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
        throw new AgentCliError('INVALID_ARG', 'Provide a valid IANA --timezone.');
    }
    const capabilities = await client
        .request(
            '/api/agent/reminders/capabilities',
            z.object({ supportsReminderTimezone: z.boolean() }),
            { method: 'GET' }
        )
        .catch((cause: unknown) => {
            if (
                cause instanceof AgentCliError &&
                ['NOT_FOUND', 'INVALID_JSON_RESPONSE'].includes(cause.code)
            ) {
                throw unsupportedTimezone();
            }
            throw cause;
        });
    if (!capabilities.supportsReminderTimezone) {
        throw unsupportedTimezone();
    }
    return timezone;
}

export const idFlag = {
    description: 'Reminder id from haus reminder list',
    name: '--id',
    valueName: '<id>',
};

function unsupportedTimezone(): AgentCliError {
    return new AgentCliError(
        'INVALID_ARG',
        'This Server cannot confirm explicit reminder timezone support.',
        {
            nextAction:
                'Update or repair the Server before scheduling this timezone; no reminder was created.',
        }
    );
}

export function confirmUpdateTimezone(
    args: ParsedArgs,
    current: { timezone?: string },
    repeat?: string | null
) {
    if (!/^(daily@|weekly:)/u.test(repeat ?? '')) {
        if (args.values['--timezone'] !== undefined) {
            throw new AgentCliError(
                'INVALID_ARG',
                '--timezone confirms the stored zone only when updating a calendar repeat.'
            );
        }
        return;
    }
    if (!current.timezone || args.values['--timezone'] !== current.timezone) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Confirm the reminder’s stored timezone with --timezone before changing to a calendar repeat.',
            {
                nextAction: `This reminder recurs in ${current.timezone ?? 'an unknown zone'}. To use a different zone, schedule a newly consented replacement and cancel this one.`,
            }
        );
    }
}

export function verifyScheduledTimezone(
    expected: string | undefined,
    receipt: { id: string; timezone?: string }
) {
    if (expected !== undefined && receipt.timezone !== expected) {
        throw new AgentCliError(
            'REMINDER_RECEIPT_UNCONFIRMED',
            'The mutation receipt did not confirm the requested timezone.',
            {
                nextAction: `Inspect reminder ${receipt.id} with haus reminder list and reconcile or cancel it before retrying. Do not claim the requested timezone is installed.`,
            }
        );
    }
}
