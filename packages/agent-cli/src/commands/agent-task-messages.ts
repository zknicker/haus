import { taskDeliveryModes, taskReportOutcomes } from '@haus/api';
import * as z from 'zod';
import { createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import { positionalTask } from './agent-task-actions.ts';
import { describeTask, type TaskDeps, taskRowSchema } from './agent-task-view.ts';

const sendResponseSchema = z.looseObject({ task: taskRowSchema });
const reportResponseSchema = z.looseObject({ reachesCaptain: z.boolean(), task: taskRowSchema });

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

export const TASK_REPORT_SUBCOMMAND: SubCommand = {
    examples: [
        'haus task report --outcome done --pr https://github.com/haus/haus/pull/12 <<< "Opened the fix; checks pass."',
        'haus task report --outcome needs-you --ask "Ship it behind the flag?" --person zach <<< "Ready to ship."',
    ],
    flags: [
        { description: 'done, needs-you or failed', name: '--outcome', valueName: '<outcome>' },
        { description: 'The question a needs-you report asks', name: '--ask', valueName: '<text>' },
        {
            description: 'The person a needs-you report asks, instead of your Captain',
            name: '--person',
            valueName: '<handle>',
        },
        {
            description: 'A pull request the turn opened; repeat for each',
            name: '--pr',
            valueName: '<url>',
        },
    ],
    name: 'report',
    notes: [
        'Reports your own turn. The report text on stdin posts in your chat; a turn your Captain directed reaches it.',
    ],
    positionals: [],
    run: (args) => runTaskReport(args, defaultDeps()),
    summary: 'Report your turn',
    usage: "haus task report --outcome done|needs-you|failed [--ask <text>] [--person <handle>] [--pr <url>]... <<'HAUSMSG'",
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

export async function runTaskReport(args: ParsedArgs, deps: TaskDeps) {
    const outcome = args.values['--outcome'];
    if (!(outcome && (taskReportOutcomes as readonly string[]).includes(outcome))) {
        throw new AgentCliError('INVALID_ARG', '--outcome is done, needs-you or failed.');
    }
    const text = (await deps.readStdin()).trim();
    if (!text) {
        throw new AgentCliError('INVALID_ARG', 'Give the report on stdin.', {
            nextAction: "haus task report --outcome done <<'HAUSMSG'",
        });
    }
    const { reachesCaptain } = await deps.client.request(
        '/api/agent/tasks/report',
        reportResponseSchema,
        {
            body: {
                ask: args.values['--ask'],
                outcome,
                person: args.values['--person'],
                pullRequestUrls: args.valueLists?.['--pr'] ?? [],
                text,
            },
            method: 'POST',
        }
    );
    deps.write(
        reachesCaptain
            ? 'Reported. It posted in your chat and reaches your Captain.\n'
            : 'Reported. It posted in your chat.\n'
    );
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
