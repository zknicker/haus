import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    requireTarget,
    singleNumber,
    type TaskDeps,
    taskSingleResponseSchema,
    withTaskSignal,
} from './agent-task-actions.ts';
import { assigneeLabel } from './agent-task-format.ts';

// `assign` moves who a task belongs to and never its status: handing work to
// someone does not announce they started. `claim` stays the "I'm starting"
// verb. The inverse is its own verb, like claim/unclaim.

export async function runTaskAssign(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(
        args,
        'haus task assign --target "#channel" --number 1 --assignee @who'
    );
    const assignee = args.values['--assignee']?.trim();
    if (!assignee) {
        throw new AgentCliError('INVALID_ARG', 'Provide --assignee @who.', {
            nextAction: 'To clear the assignee: haus task unassign --target <target> --number <n>',
        });
    }
    const response = await deps.client.request(
        '/api/agent/tasks/assign',
        taskSingleResponseSchema,
        withTaskSignal(deps, {
            body: {
                assignee: assignee.startsWith('@') ? assignee : `@${assignee}`,
                expectedRevision: expectedRevision(args),
                number: singleNumber(args),
                target,
            },
            method: 'POST',
        })
    );
    const task = response.task;
    deps.write(
        `Assigned task #${task.number} to ${assigneeLabel(task.assignee)} [${task.status}, rev=${task.version}]. Status is unchanged; the assignee claims it to start.\n`
    );
    return 0;
}

export async function runTaskUnassign(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(args, 'haus task unassign --target "#channel" --number 1');
    const response = await deps.client.request(
        '/api/agent/tasks/unassign',
        taskSingleResponseSchema,
        withTaskSignal(deps, {
            body: { expectedRevision: expectedRevision(args), number: singleNumber(args), target },
            method: 'POST',
        })
    );
    const task = response.task;
    deps.write(`Task #${task.number} is now unassigned [${task.status}, rev=${task.version}].\n`);
    return 0;
}

function expectedRevision(args: ParsedArgs): number | undefined {
    const raw = args.values['--expected-revision'];
    if (raw === undefined) {
        return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--expected-revision must be a non-negative integer; got "${raw}".`
        );
    }
    return parsed;
}
