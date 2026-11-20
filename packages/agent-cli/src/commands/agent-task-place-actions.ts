import { isClosedTaskState, type TaskState, taskStates } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { assertAgentTarget, requiredValue } from './agent-command-utils.ts';
import { expectedVersion, positionalKey, readDescription } from './agent-task-actions.ts';
import {
    describeTask,
    type TaskDeps,
    taskAttachPullRequestSchema,
    taskPlaceLine,
    taskSingleSchema,
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
            assignee: args.values['--assignee'],
            description: await readDescription(args, deps),
            dueOn: args.values['--due'],
            from,
            priority: args.values['--priority'],
            project: args.values['--project'],
            state: startState(args),
            target,
            title: requiredValue(args, '--title'),
        },
        method: 'POST',
    });
    deps.write(
        [
            `Started ${describeTask(response.task)}`,
            `Task target: ${response.target}`,
            `Started from message ${shortMessageId(from)} in ${target}; its author and anyone it mentions follow the Task.`,
            '',
        ].join('\n')
    );
    return 0;
}

export async function runTaskState(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const state = taskStateArgument(args.positionals[1]);
    const { task } = await deps.client.request('/api/agent/tasks/state', taskSingleSchema, {
        body: { expectedVersion: expectedVersion(args), key: positionalKey(args), state },
        method: 'POST',
    });
    deps.write(`${task.key} is ${task.state}. ${stateConsequence(task.state)}\n`);
    return 0;
}

export async function runTaskAttachPullRequest(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const url = args.positionals[1]?.trim();
    if (!url) {
        throw new AgentCliError('INVALID_ARG', 'Give the pull request URL after the Task key.', {
            nextAction: 'haus task attach-pr SEC-12 https://github.com/owner/repo/pull/12',
        });
    }
    const { pullRequest, task } = await deps.client.request(
        '/api/agent/tasks/attach-pr',
        taskAttachPullRequestSchema,
        { body: { key: positionalKey(args), url }, method: 'POST' }
    );
    deps.write(
        [
            `Attached ${pullRequest.repository}#${pullRequest.number} to ${task.key}. When it becomes ready for review or its checks finish, Haus wakes you on the Task.`,
            taskPlaceLine(task.key),
            '',
        ].join('\n')
    );
    return 0;
}

function stateConsequence(state: TaskState): string {
    if (isClosedTaskState(state)) {
        return 'It leaves the sidebar and its pending reminders are canceled; a post in it reopens it.';
    }
    return state === 'open'
        ? 'It shows in the sidebar with its state.'
        : 'Todo Tasks are not listed in the sidebar.';
}

function taskStateArgument(value: string | undefined): TaskState {
    const state = taskStates.find((candidate) => candidate === value);
    if (!state) {
        throw new AgentCliError('INVALID_ARG', `Give the new state: ${taskStates.join(', ')}.`, {
            nextAction: 'haus task state SEC-12 done',
        });
    }
    return state;
}

function startState(args: ParsedArgs): 'open' | 'todo' | undefined {
    const value = args.values['--state'];
    if (value === undefined || value === 'open' || value === 'todo') {
        return value;
    }
    throw new AgentCliError('INVALID_ARG', 'A Task starts todo or open.', {
        nextAction: 'Omit --state to start it open.',
    });
}
