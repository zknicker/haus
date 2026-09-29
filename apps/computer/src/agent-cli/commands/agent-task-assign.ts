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

// `assign` moves which Agent a task belongs to and never its status: handing
// work to someone does not announce they started. `claim` stays the "I'm
// starting" verb. The inverse is its own verb, like claim/unclaim. Humans are
// never assignees (ADR 0037); they are handed work by @mention in the thread.

const HUMAN_HANDOFF =
    'Only Agent members of the chat hold tasks. To hand work to a human, @mention them in the task thread with what you need from them.';

export async function runTaskAssign(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requireTarget(
        args,
        'haus task assign --target "#channel" --number 1 --assignee @agent'
    );
    const assignee = args.values['--assignee']?.trim();
    if (!assignee) {
        throw new AgentCliError('INVALID_ARG', 'Provide --assignee @agent.', {
            nextAction: 'To clear the assignee: haus task unassign --target <target> --number <n>',
        });
    }
    const response = await deps.client
        .request(
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
        )
        .catch((cause: unknown) => {
            throw withHumanHandoff(cause);
        });
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

/**
 * The Server refuses a human handle with the same not-assignable refusal as a
 * missing or out-of-Chat one, so the CLI names the human path beside it.
 */
function withHumanHandoff(cause: unknown): unknown {
    if (
        cause instanceof AgentCliError &&
        !cause.options.nextAction &&
        cause.message.includes('is not assignable')
    ) {
        return new AgentCliError(cause.code, cause.message, {
            ...cause.options,
            nextAction: HUMAN_HANDOFF,
        });
    }
    return cause;
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
