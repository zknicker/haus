import { formatTaskTarget } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { CliFlag, ParsedArgs } from '../parse.ts';
import { taskKeyArgument } from './agent-command-utils.ts';

/**
 * Where a reminder anchors: a message (`--message-id`), or a Task (`--target task:SEC-12`,
 * ADR 0053 decision 16). Exactly one. A Task holds only one-time reminders; a recurring one
 * belongs on a Channel, and a fire that finds real work starts a Task there.
 */
export const reminderAnchorFlags: CliFlag[] = [
    {
        description: 'Anchor message id (msg= from a message you received or read)',
        name: '--message-id',
        valueName: '<id>',
    },
    {
        description: 'Anchor on a Task instead, one-time only: it wakes you on that Task',
        name: '--target',
        valueName: '<task:KEY-n>',
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
            'Give one anchor: --message-id or --target task:KEY-n, not both.'
        );
    }
    if (target) {
        const key = taskKeyArgument(target, '--target');
        if (args.values['--repeat']) {
            throw taskRecurringReminder(`Task ${key} holds only one-time reminders.`);
        }
        return { target: formatTaskTarget(key) };
    }
    if (!messageId) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --message-id with the anchor message, or --target task:KEY-n for a Task.',
            {
                nextAction:
                    'Use the msg= id from the message this follow-up is about, or the key of the Task you are working.',
            }
        );
    }
    return { messageId };
}

/** The Server's `TASK_RECURRING_REMINDER` refusal, given the step that resolves it. */
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
