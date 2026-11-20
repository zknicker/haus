import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { isCalendarRepeat } from './reminder-cadence-label.ts';

export const reminderCommandIdFlag = {
    description:
        'Stable id for retrying identical schedule input; persist it with --fire-at (calendar repeats need none)',
    name: '--command-id',
    valueName: '<id>',
};

export function scheduleCommandId(args: ParsedArgs): string | undefined {
    const id = args.values['--command-id']?.trim();
    // A calendar repeat's derived first fire is not part of the request, so its
    // input stays identical on retry without a saved --fire-at.
    const timed = Boolean(args.values['--fire-at']) || isCalendarRepeat(args.values['--repeat']);
    if (id !== undefined && (!id || id.length > 128 || !timed)) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Use --command-id with --fire-at and an id of 1–128 characters.',
            {
                nextAction:
                    'Persist the exact first fire time and command id, then reuse identical schedule input on retry.',
            }
        );
    }
    return id;
}
