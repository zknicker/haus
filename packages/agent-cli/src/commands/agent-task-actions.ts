import type { ParsedArgs } from '../parse.ts';
import { optionalInteger, taskRefArgument } from './agent-command-utils.ts';
import {
    describeTask,
    formatTaskDetail,
    type TaskDeps,
    taskListSchema,
    taskShowSchema,
    taskSingleSchema,
} from './agent-task-view.ts';

export async function runTaskList(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const all = args.flags['--all'] === true;
    const archived = args.flags['--archived'] === true;
    const project = args.values['--project'];
    const { omitted, tasks } = await deps.client.request('/api/agent/tasks', taskListSchema, {
        method: 'GET',
        query: {
            ...(all ? { all: 'true' } : {}),
            ...(archived ? { archived: 'true' } : {}),
            ...(project ? { project } : {}),
        },
    });
    const scope = `${archived ? 'archived' : 'active'} Tasks${all ? '' : ' you started'}`;
    if (tasks.length === 0) {
        deps.write(`No ${scope}.\n`);
        return 0;
    }
    const total = tasks.length + omitted;
    const heading = `${total} ${scope}, newest first:`;
    const more =
        omitted > 0 ? [`Truncated: ${omitted} more. Narrow with --project or --archived.`] : [];
    deps.write(`${[heading, ...tasks.map(describeTask), ...more].join('\n')}\n`);
    return 0;
}

export async function runTaskShow(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const detail = await deps.client.request('/api/agent/tasks/show', taskShowSchema, {
        method: 'GET',
        query: { task: positionalTask(args) },
    });
    deps.write(formatTaskDetail(detail));
    return 0;
}

export async function runTaskArchive(args: ParsedArgs, deps: TaskDeps): Promise<number> {
    const { task } = await deps.client.request('/api/agent/tasks/archive', taskSingleSchema, {
        body: { expectedVersion: expectedVersion(args), task: positionalTask(args) },
        method: 'POST',
    });
    deps.write(
        `${task.shortId} is archived. It leaves the sidebar and its pending reminders are canceled.\n`
    );
    return 0;
}

export async function readDescription(args: ParsedArgs, deps: TaskDeps) {
    const value = args.values['--description'];
    return value === '-' ? (await deps.readStdin()).trim() : value;
}

export function expectedVersion(args: ParsedArgs) {
    return optionalInteger(args, '--expected-version', { minimum: 1 });
}

export function positionalTask(args: ParsedArgs) {
    return taskRefArgument(args.positionals[0], '<id>');
}
