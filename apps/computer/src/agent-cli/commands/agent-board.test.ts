import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runBoardCreate, runBoardList } from './agent-board.ts';
import { runBoardColumns } from './agent-board-columns.ts';
import type { BoardView } from './agent-board-view.ts';

const board: BoardView = {
    columns: [
        { category: 'backlog', id: 'col_backlog', name: 'Backlog', position: 0 },
        { category: 'todo', id: 'col_todo', name: 'Todo', position: 1 },
        { category: 'active', id: 'col_active', name: 'In progress', position: 2 },
        { category: 'done', id: 'col_done', name: 'Done', position: 3 },
        { category: 'canceled', id: 'col_canceled', name: 'Canceled', position: 4 },
    ],
    id: 'brd_1',
    key: 'SEC',
    name: 'Security',
    openTaskCount: 12,
    version: 4,
};

const summary =
    'Backlog (backlog), Todo (todo), In progress (active), Done (done), Canceled (canceled)';

test('list prints each board with its columns and categories', async () => {
    const { lines, run } = harness();
    await run(runBoardList, args());
    expect(lines.join('')).toBe(`SEC "Security" · 12 open · ${summary}\n`);
});

test('create sends the key and name and restates the board', async () => {
    const { calls, lines, run } = harness();
    await run(runBoardCreate, args({ values: { '--key': 'SEC', '--name': 'Security' } }));
    expect(calls.at(-1)?.input?.body).toEqual({ key: 'SEC', name: 'Security' });
    expect(lines.join('')).toBe(`Created board SEC "Security" · 12 open · ${summary}\n`);
});

test('create needs a key and a name', async () => {
    const { run } = harness();
    await expect(run(runBoardCreate, args({ values: { '--key': 'SEC' } }))).rejects.toThrow(
        '--name is required.'
    );
});

test('a new column lands after the last column of its category, with the version it read', async () => {
    const { lines, run, sent } = harness();

    await run(
        runBoardColumns,
        args({
            positionals: ['SEC', 'add'],
            values: { '--category': 'active', '--name': 'Blocked' },
        })
    );

    const body = sent();
    expect(body.board).toBe('SEC');
    expect(body.expectedVersion).toBe(4);
    expect(body.moveTasks).toBeUndefined();
    expect(body.columns).toEqual([
        { category: 'backlog', id: 'col_backlog', name: 'Backlog' },
        { category: 'todo', id: 'col_todo', name: 'Todo' },
        { category: 'active', id: 'col_active', name: 'In progress' },
        { category: 'active', name: 'Blocked' },
        { category: 'done', id: 'col_done', name: 'Done' },
        { category: 'canceled', id: 'col_canceled', name: 'Canceled' },
    ]);
    expect(lines.join('')).toBe(`Added Blocked (active).\nColumns on SEC: ${summary}\n`);
});

test('--position places a new column, counted from 1 and never past the end', async () => {
    const { run, sent } = harness();
    await run(
        runBoardColumns,
        args({
            positionals: ['SEC', 'add'],
            values: { '--category': 'todo', '--name': 'Triage', '--position': '1' },
        })
    );
    expect(sent().columns[0]).toEqual({ category: 'todo', name: 'Triage' });

    await expect(
        run(
            runBoardColumns,
            args({
                positionals: ['SEC', 'add'],
                values: { '--category': 'todo', '--name': 'Late', '--position': '7' },
            })
        )
    ).rejects.toThrow('--position must be between 1 and 6.');
});

test('add refuses a category the Server would', async () => {
    const { run } = harness();
    await expect(
        run(
            runBoardColumns,
            args({
                positionals: ['SEC', 'add'],
                values: { '--category': 'blocked', '--name': 'Blocked' },
            })
        )
    ).rejects.toThrow('Unknown category blocked.');
});

test('rename keeps the id, so the column and its Tasks stay', async () => {
    const { lines, run, sent } = harness();
    await run(
        runBoardColumns,
        args({
            positionals: ['SEC', 'rename'],
            values: { '--column': 'in progress', '--name': 'Doing' },
        })
    );
    expect(sent().columns[2]).toEqual({ category: 'active', id: 'col_active', name: 'Doing' });
    expect(lines.join('')).toStartWith('Renamed In progress to Doing.\n');
});

test('move reorders the whole list', async () => {
    const { run, sent } = harness();
    await run(
        runBoardColumns,
        args({ positionals: ['SEC', 'move'], values: { '--column': 'Backlog', '--position': '3' } })
    );
    expect(sent().columns.map((column) => column.name)).toEqual([
        'Todo',
        'In progress',
        'Backlog',
        'Done',
        'Canceled',
    ]);
});

test('move needs a position', async () => {
    const { run } = harness();
    await expect(
        run(runBoardColumns, args({ positionals: ['SEC', 'move'], values: { '--column': 'Todo' } }))
    ).rejects.toThrow('--position is required.');
});

test('removing an empty column needs no target', async () => {
    const { lines, run, sent } = harness({ tasks: [] });
    await run(
        runBoardColumns,
        args({ positionals: ['SEC', 'remove'], values: { '--column': 'Backlog' } })
    );
    expect(sent().columns.map((column) => column.name)).not.toContain('Backlog');
    expect(sent().moveTasks).toBeUndefined();
    expect(lines.join('')).toStartWith('Removed Backlog.\n');
});

test('removing a column that holds Tasks requires --move-to and writes nothing', async () => {
    const { calls, run } = harness({ tasks: [taskIn('col_backlog')] });

    const failure = run(
        runBoardColumns,
        args({ positionals: ['SEC', 'remove'], values: { '--column': 'Backlog' } })
    );

    await expect(failure).rejects.toMatchObject({
        code: 'INVALID_ARG',
        options: {
            nextAction: 'haus board columns SEC remove --column "Backlog" --move-to <column>',
        },
    });
    expect(calls.map((call) => call.route)).not.toContain('/api/agent/boards/columns');
});

test('a Task in another column of the same category does not block a removal', async () => {
    const { run, sent } = harness({ tasks: [taskIn('col_other')] });
    await run(
        runBoardColumns,
        args({ positionals: ['SEC', 'remove'], values: { '--column': 'Backlog' } })
    );
    expect(sent().columns).toHaveLength(4);
});

test('--move-to maps the removed column to the one that takes its Tasks', async () => {
    const { lines, run, sent } = harness();
    await run(
        runBoardColumns,
        args({
            positionals: ['SEC', 'remove'],
            values: { '--column': 'Backlog', '--move-to': 'todo' },
        })
    );
    expect(sent().moveTasks).toEqual({ col_backlog: 'col_todo' });
    expect(lines.join('')).toStartWith('Removed Backlog; its Tasks moved to Todo.\n');

    await expect(
        run(
            runBoardColumns,
            args({
                positionals: ['SEC', 'remove'],
                values: { '--column': 'Backlog', '--move-to': 'Backlog' },
            })
        )
    ).rejects.toThrow('--move-to must name a column that stays.');
});

test('an unknown board, column, or edit is refused with what exists', async () => {
    const { run } = harness();
    await expect(
        run(
            runBoardColumns,
            args({ positionals: ['OPS', 'remove'], values: { '--column': 'Todo' } })
        )
    ).rejects.toMatchObject({ code: 'BOARD_NOT_FOUND' });
    await expect(
        run(
            runBoardColumns,
            args({ positionals: ['SEC', 'remove'], values: { '--column': 'Nope' } })
        )
    ).rejects.toMatchObject({
        code: 'INVALID_ARG',
        options: { nextAction: `Its columns: ${summary}.` },
    });
    await expect(run(runBoardColumns, args({ positionals: ['SEC', 'archive'] }))).rejects.toThrow(
        'Unknown column edit "archive".'
    );
});

function taskIn(columnId: string) {
    return {
        assignee: null,
        board: 'SEC',
        category: 'backlog',
        column: 'Backlog',
        columnId,
        createdAt: '2026-11-04T09:00:00.000Z',
        createdBy: { handle: 'zero', type: 'human' },
        dueOn: null,
        key: 'SEC-1',
        labels: [],
        priority: 'none',
        title: 'Someday',
        updatedAt: '2026-11-04T09:00:00.000Z',
        version: 1,
    };
}

function harness({ tasks = [] as unknown[] } = {}) {
    const calls: { input: AgentApiRequest | undefined; route: string }[] = [];
    const lines: string[] = [];
    const client: AgentApiRequester = {
        request<T>(route: string, schema: z.ZodType<T>, input?: AgentApiRequest): Promise<T> {
            calls.push({ input, route });
            const response =
                route === '/api/agent/tasks'
                    ? { omitted: 0, tasks }
                    : route === '/api/agent/boards'
                      ? { boards: [board] }
                      : { board };
            return Promise.resolve(schema.parse(response));
        },
    };
    const deps = {
        client,
        write: (text: string) => {
            lines.push(text);
        },
    };
    return {
        calls,
        lines,
        run: (
            action: (input: ParsedArgs, boardDeps: typeof deps) => Promise<number>,
            parsed: ParsedArgs
        ) => action(parsed, deps),
        /** The last whole-list write. */
        sent: () =>
            calls.filter((call) => call.route === '/api/agent/boards/columns').at(-1)?.input
                ?.body as {
                board: string;
                columns: { category: string; id?: string; name: string }[];
                expectedVersion: number;
                moveTasks?: Record<string, string>;
            },
    };
}

function args(input: Partial<ParsedArgs> = {}): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values: {}, ...input };
}
