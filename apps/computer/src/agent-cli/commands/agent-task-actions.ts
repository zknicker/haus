import { columnCategories, isClosedColumnCategory, openColumnCategories } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { boardListSchema, describeColumns } from './agent-board-view.ts';
import { optionalInteger, requiredValue, valuesFor } from './agent-command-utils.ts';
import { normalizeClearable } from './agent-reminder-view.ts';
import {
    actorLabel,
    describeTask,
    formatTaskDetail,
    formatTaskQueue,
    type TaskDeps,
    taskListSchema,
    taskMoveSchema,
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
        deps.write(mine ? 'No open Tasks assigned to you.\n' : 'No Tasks match.\n');
        return 0;
    }
    const total = tasks.length + omitted;
    const noun = total === 1 ? 'Task' : 'Tasks';
    const heading = `${total} ${noun}${mine ? ' assigned to you' : ''}, by priority then age:`;
    const more =
        omitted > 0
            ? [`Truncated: ${omitted} more. Narrow with --board, --assignee, or --category.`]
            : [];
    deps.write(`${[heading, ...tasks.map(describeTask), ...more].join('\n')}\n`);
    return 0;
}

export async function runTaskShow(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const detail = await deps.client.request('/api/agent/tasks/show', taskShowSchema, {
        method: 'GET',
        query: { key: taskKey(args) },
    });
    const { boards } = await deps.client.request('/api/agent/boards', boardListSchema, {
        method: 'GET',
    });
    // An archived board is not listed, so its Task prints without the column line.
    const board = boards.find((candidate) => candidate.key === detail.task.board);
    deps.write(formatTaskDetail(detail, board ? describeColumns(board.columns) : null));
    return 0;
}

export async function runTaskCreate(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const { task } = await deps.client.request('/api/agent/tasks/create', taskSingleSchema, {
        body: {
            assignee: args.values['--assignee'],
            board: requiredValue(args, '--board'),
            column: args.values['--column'],
            description: await readDescription(args, deps),
            dueOn: args.values['--due'],
            labels: labelNames(args),
            priority: args.values['--priority'],
            title: requiredValue(args, '--title'),
        },
        method: 'POST',
    });
    deps.write(`Created ${describeTask(task)}\n`);
    return 0;
}

export async function runTaskMove(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const { queue, task } = await deps.client.request('/api/agent/tasks/move', taskMoveSchema, {
        body: {
            column: requiredValue(args, '--column'),
            expectedVersion: expectedVersion(args),
            key: taskKey(args),
        },
        method: 'POST',
    });
    const waiting = isClosedColumnCategory(task.category) ? formatTaskQueue(queue) : null;
    deps.write(
        `Moved ${task.key} to ${task.column} [${task.category}].\n${waiting ? `${waiting}\n` : ''}`
    );
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
        body: { ...fields, expectedVersion: expectedVersion(args), key: taskKey(args) },
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
            key: taskKey(args),
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
 * Your own open Tasks unless a flag says otherwise: `--all` and `--board` ask about other
 * people's work too, `--assignee` names whose, and `--category` replaces the open categories.
 */
function taskListQuery(args: ParsedArgs) {
    const all = args.flags['--all'] === true;
    const assignee = args.values['--assignee'];
    const board = args.values['--board'];
    if (all && assignee) {
        throw new AgentCliError('INVALID_ARG', 'Use --all or --assignee, not both.');
    }
    return {
        assignee: assignee ? assigneeFilter(assignee) : all || board ? undefined : 'me',
        board,
        category: categoryFilter(args),
    };
}

/** The route takes `me`, `none`, or an @handle, so a bare handle gains its `@`. */
function assigneeFilter(value: string): string {
    return value === 'me' || value === 'none' || value.startsWith('@') ? value : `@${value}`;
}

function categoryFilter(args: ParsedArgs): string {
    const named = commaList(args, '--category');
    const unknown = named.filter((category) => !isColumnCategory(category));
    if (unknown.length > 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Unknown category ${unknown.join(', ')}. Use ${columnCategories.join(', ')}.`
        );
    }
    return (named.length > 0 ? named : openColumnCategories).join(',');
}

function isColumnCategory(value: string): boolean {
    return (columnCategories as readonly string[]).includes(value);
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

async function readDescription(args: ParsedArgs, deps: TaskDeps): Promise<string | undefined> {
    const value = args.values['--description'];
    return value === '-' ? (await deps.readStdin()).trim() : value;
}

function expectedVersion(args: ParsedArgs): number | undefined {
    return optionalInteger(args, '--expected-version', { minimum: 1 });
}

function taskKey(args: ParsedArgs): string {
    return args.positionals[0] ?? '';
}
