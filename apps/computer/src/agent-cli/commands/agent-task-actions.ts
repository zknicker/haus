import { type TaskState, taskStates } from '@haus/api';

import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { optionalInteger, taskKeyArgument, valuesFor } from './agent-command-utils.ts';
import { normalizeClearable } from './agent-reminder-view.ts';
import {
    actorLabel,
    describeTask,
    formatTaskDetail,
    type TaskDeps,
    taskListSchema,
    taskShowSchema,
    taskSingleSchema,
} from './agent-task-view.ts';

export async function runTaskList(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const query = taskListQuery(args);
    const { omitted, tasks } = await deps.client.request('/api/agent/tasks', taskListSchema, {
        method: 'GET',
        query,
    });
    const mine = query.assignee === 'me';
    if (tasks.length === 0) {
        deps.write(mine ? 'No unfinished Tasks assigned to you.\n' : 'No Tasks match.\n');
        return 0;
    }
    const total = tasks.length + omitted;
    const noun = total === 1 ? 'Task' : 'Tasks';
    const heading = `${total} ${noun}${mine ? ' assigned to you' : ''}, by priority then age:`;
    const more =
        omitted > 0
            ? [`Truncated: ${omitted} more. Narrow with --key, --assignee, or --state.`]
            : [];
    deps.write(`${[heading, ...tasks.map(describeTask), ...more].join('\n')}\n`);
    return 0;
}

export async function runTaskShow(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const detail = await deps.client.request('/api/agent/tasks/show', taskShowSchema, {
        method: 'GET',
        query: { key: positionalKey(args) },
    });
    deps.write(formatTaskDetail(detail));
    return 0;
}

export async function runTaskUpdate(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const fields = {
        description: await readDescription(args, deps),
        dueOn: normalizeClearable(args.values['--due']),
        labels: args.values['--labels'] === 'none' ? [] : labelNames(args),
        priority: args.values['--priority'],
        title: args.values['--title'],
    };
    if (Object.values(fields).every((value) => value === undefined)) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide at least one of --title, --description, --priority, --labels, or --due.'
        );
    }
    const { task } = await deps.client.request('/api/agent/tasks/update', taskSingleSchema, {
        body: { ...fields, expectedVersion: expectedVersion(args), key: positionalKey(args) },
        method: 'POST',
    });
    deps.write(`Updated ${describeTask(task)}\n`);
    return 0;
}

export async function runTaskAssign(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const assignee = args.positionals[1];
    const { task } = await deps.client.request('/api/agent/tasks/assign', taskSingleSchema, {
        body: {
            assignee: assignee === 'none' ? null : assignee,
            expectedVersion: expectedVersion(args),
            key: positionalKey(args),
        },
        method: 'POST',
    });
    deps.write(
        task.assignee
            ? `Assigned ${task.key} to ${actorLabel(task.assignee)}.\n`
            : `Unassigned ${task.key}.\n`
    );
    return 0;
}

/**
 * Your own unfinished Tasks unless a flag says otherwise: `--all` and `--key` ask about other
 * people's work too, `--assignee` names whose, and `--state` replaces todo and open.
 */
function taskListQuery(args: ParsedArgs) {
    const all = args.flags['--all'] === true;
    const assignee = args.values['--assignee'];
    const key = args.values['--key'];
    if (all && assignee) {
        throw new AgentCliError('INVALID_ARG', 'Use --all or --assignee, not both.');
    }
    return {
        assignee: assignee ? assigneeFilter(assignee) : all || key ? undefined : 'me',
        key,
        state: stateFilter(args).join(','),
    };
}

/** The route takes `me`, `none`, or an @handle, so a bare handle gains its `@`. */
function assigneeFilter(value: string): string {
    return value === 'me' || value === 'none' || value.startsWith('@') ? value : `@${value}`;
}

function stateFilter(args: ParsedArgs): TaskState[] {
    const named = commaList(args, '--state');
    const unknown = named.filter((state) => !(taskStates as readonly string[]).includes(state));
    if (unknown.length > 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Unknown state ${unknown.join(', ')}. Use ${taskStates.join(', ')}.`
        );
    }
    return named.length > 0 ? (named as TaskState[]) : ['todo', 'open'];
}

function labelNames(args: ParsedArgs): string[] | undefined {
    const names = commaList(args, '--labels');
    return names.length > 0 ? names : undefined;
}

function commaList(args: ParsedArgs, flag: string): string[] {
    return valuesFor(args, flag).flatMap((value) =>
        value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
    );
}

export async function readDescription(
    args: ParsedArgs,
    deps: TaskDeps
): Promise<string | undefined> {
    const value = args.values['--description'];
    return value === '-' ? (await deps.readStdin()).trim() : value;
}

export function expectedVersion(args: ParsedArgs): number | undefined {
    return optionalInteger(args, '--expected-version', { minimum: 1 });
}

export function positionalKey(args: ParsedArgs): string {
    return taskKeyArgument(args.positionals[0], '<key>');
}
