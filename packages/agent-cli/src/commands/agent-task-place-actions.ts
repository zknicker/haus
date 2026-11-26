import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { assertAgentTarget, requiredValue } from './agent-command-utils.ts';
import { positionalTask, readDescription } from './agent-task-actions.ts';
import {
    describeTask,
    type TaskDeps,
    taskAttachPullRequestSchema,
    taskPlaceLine,
    taskStartSchema,
} from './agent-task-view.ts';

export async function runTaskStart(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    if (target.startsWith('task:')) {
        throw new AgentCliError(
            'INVALID_ARG',
            `A Task starts from a message in a channel or DM, not one inside a Task (${target}).`,
            {
                nextAction:
                    'Start it from the message in the channel or DM that asked for the work.',
            }
        );
    }
    const from = requiredValue(args, '--from');
    const response = await deps.client.request('/api/agent/tasks/start', taskStartSchema, {
        body: {
            description: await readDescription(args, deps),
            from,
            project: args.values['--project'],
            target,
            title: requiredValue(args, '--title'),
        },
        method: 'POST',
    });
    deps.write(
        [
            `Started ${describeTask(response.task)}`,
            `Task target: ${response.target}`,
            `Started from message ${shortMessageId(from)} in ${target}; you, its author and anyone it mentions follow the Task.`,
            '',
        ].join('\n')
    );
    return 0;
}

export async function runTaskAttachPullRequest(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const url = args.positionals[1]?.trim();
    if (!url) {
        throw new AgentCliError('INVALID_ARG', 'Give the pull request URL after the Task id.', {
            nextAction: 'haus task attach-pr k3mq7xta https://github.com/owner/repo/pull/12',
        });
    }
    const { pullRequest, task } = await deps.client.request(
        '/api/agent/tasks/attach-pr',
        taskAttachPullRequestSchema,
        { body: { task: positionalTask(args), url }, method: 'POST' }
    );
    deps.write(
        [
            `Attached ${pullRequest.repository}#${pullRequest.number} to ${task.shortId}. When it becomes ready for review or its checks finish, Haus wakes you on the Task.`,
            taskPlaceLine(task.shortId),
            '',
        ].join('\n')
    );
    return 0;
}
