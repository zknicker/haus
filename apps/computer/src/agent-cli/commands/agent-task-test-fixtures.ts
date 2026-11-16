import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { TaskDeps, TaskRow } from './agent-task-view.ts';

export const task: TaskRow = {
    assignee: { handle: 'kit', type: 'agent' },
    board: 'SEC',
    category: 'todo',
    column: 'Todo',
    columnId: 'col_todo',
    createdAt: '2026-11-04T09:00:00.000Z',
    createdBy: { handle: 'zero', type: 'human' },
    dueOn: null,
    key: 'SEC-12',
    labels: [],
    priority: 'high',
    title: 'Rotate the signing key',
    updatedAt: '2026-11-04T10:00:00.000Z',
    version: 3,
};

type Responder = (route: string, input: AgentApiRequest | undefined) => unknown;

/** A stub Agent API: records every call, answers with `respond`, and collects what is written. */
export function harness(respond: Responder) {
    const calls: { input: AgentApiRequest | undefined; route: string }[] = [];
    const lines: string[] = [];
    const client: AgentApiRequester = {
        request<T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest): Promise<T> {
            calls.push({ input, route });
            return Promise.resolve(schema.parse(respond(route, input)));
        },
    };
    const deps: TaskDeps = {
        client,
        readStdin: () => Promise.resolve('From stdin\n'),
        write: (text) => {
            lines.push(text);
        },
    };
    return {
        calls,
        lines,
        run: (
            action: (input: ParsedArgs, taskDeps: TaskDeps) => Promise<number>,
            parsed: ParsedArgs
        ) => action(parsed, deps),
    };
}

export function args(input: Partial<ParsedArgs> = {}): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values: {}, ...input };
}
