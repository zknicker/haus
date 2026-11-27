import { taskDeliveryModes } from '@haus/api';
import * as z from 'zod';
import { createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { positionalTask } from './agent-task-actions.ts';
import { describeTask, type TaskDeps, taskRowSchema } from './agent-task-view.ts';

const sendResponseSchema = z.looseObject({ task: taskRowSchema });

export const TASK_SEND_SUBCOMMAND: SubCommand = {
    examples: [
        'haus task send k3mq7xta < follow-up.md',
        'haus task send k3mq7xta --delivery interrupt < stop-and-check.md',
    ],
    flags: [
        {
            description:
                'steer (default) at its next tool boundary, interrupt now, or queue for its next turn',
            name: '--delivery',
            valueName: '<steer|interrupt|queue>',
        },
    ],
    name: 'send',
    notes: [
        'Posts stdin in that Task’s chat as you and wakes it. It is the one way to message another Task.',
        'From a Captain it brings back an archived Task; from a Task it is refused TASK_ARCHIVED.',
    ],
    positionals: ['<id>'],
    run: (args) => runTaskSend(args, defaultDeps()),
    summary: 'Message a Task and wake it',
    usage: 'haus task send <id> [--delivery steer|interrupt|queue] < body',
};

export async function runTaskSend(args: ParsedArgs, deps: TaskDeps) {
    const delivery = args.values['--delivery'] ?? 'steer';
    if (!(taskDeliveryModes as readonly string[]).includes(delivery)) {
        throw new AgentCliError('INVALID_ARG', '--delivery is steer, interrupt or queue.');
    }
    const body = (await deps.readStdin()).trim();
    if (!body) {
        throw new AgentCliError('INVALID_ARG', 'Give the message on stdin.', {
            nextAction: 'haus task send k3mq7xta < follow-up.md',
        });
    }
    const { task } = await deps.client.request('/api/agent/tasks/send', sendResponseSchema, {
        body: { body, delivery, task: positionalTask(args) },
        method: 'POST',
    });
    deps.write(`Sent to ${describeTask(task)} (${delivery}). It answers in its own chat.\n`);
    return 0;
}

function defaultDeps() {
    const deps: TaskDeps = {
        client: createAgentApiClient(),
        readStdin: readAgentStdin,
        write: (text) => process.stdout.write(text),
    };
    return deps;
}
