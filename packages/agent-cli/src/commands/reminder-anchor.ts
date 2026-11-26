import { formatTaskTarget } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { CliFlag, ParsedArgs } from '../parse.ts';
import { taskShortIdArgument } from './agent-command-utils.ts';

export const reminderAnchorFlags: CliFlag[] = [
    {
        description: 'Anchor message id (msg= from a message you received or read)',
        name: '--message-id',
        valueName: '<id>',
    },
    {
        description: 'Anchor on a Task instead, one-time only: it wakes you on that Task',
        name: '--target',
        valueName: '<task:shortId>',
    },
];

export type ReminderAnchor = { messageId: string } | { target: string };

const TASK_RECURRING_NEXT_ACTION =
    'Recurring reminders belong on a Channel: anchor this one with --message-id on a channel message. When a fire turns up real work, start a Task from your answer. For a one-time check on the Task, drop --repeat.';

export function reminderAnchor(args: ParsedArgs): ReminderAnchor {
    const messageId = args.values['--message-id']?.trim();
    const target = args.values['--target']?.trim();
    if (messageId && target) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Give one anchor: --message-id or --target task:<shortId>, not both.'
        );
    }
    if (target) {
        const shortId = taskShortIdArgument(target, '--target');
        if (args.values['--repeat']) {
            throw taskRecurringReminder(`Task ${shortId} holds only one-time reminders.`);
        }
        return { target: formatTaskTarget(shortId) };
    }
    if (!messageId) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --message-id with the anchor message, or --target task:<shortId> for a Task.',
            {
                nextAction:
                    'Use the msg= id from the message this follow-up is about, or the short id of the Task you are working.',
            }
        );
    }
    return { messageId };
}

export function withTaskReminderStep(error: unknown): unknown {
    return error instanceof AgentCliError && error.code === 'TASK_RECURRING_REMINDER'
        ? taskRecurringReminder(error.message)
        : error;
}

function taskRecurringReminder(message: string): AgentCliError {
    return new AgentCliError('TASK_RECURRING_REMINDER', message, {
        nextAction: TASK_RECURRING_NEXT_ACTION,
    });
}
