import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

export const reminderCommandIdFlag = {
    description: 'Stable id for retrying identical schedule input; persist it with --fire-at',
    name: '--command-id',
    valueName: '<id>',
};

export function scheduleCommandId(args: ParsedArgs): string | undefined {
    const id = args.values['--command-id']?.trim();
    if (id !== undefined && (!id || id.length > 128 || !args.values['--fire-at'])) {
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
