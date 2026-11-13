import { columnCategories } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { runBoardColumns } from './agent-board-columns.ts';
import { boardListSchema, boardSingleSchema, describeBoard } from './agent-board-view.ts';
import { requiredValue } from './agent-command-utils.ts';

export interface BoardDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

// Boards (ADR 0051): every member and Agent sees every board and may edit its columns. A column's
// category, not its name, is what a Task's state means.
export const BOARD_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus board list'],
        flags: [],
        name: 'list',
        notes: ['Each column prints its category. Archived boards are left out.'],
        positionals: [],
        run: (args) => runBoardList(args, defaultDeps()),
        summary: 'List the boards with their columns and open counts',
        usage: 'haus board list',
    },
    {
        examples: ['haus board create --key SEC --name "Security"'],
        flags: [
            {
                description: '2 to 5 capitals and digits, like SEC; its Tasks read as SEC-12',
                name: '--key',
                valueName: '<key>',
            },
            {
                description: 'Display name, up to 60 characters',
                name: '--name',
                valueName: '<text>',
            },
        ],
        name: 'create',
        notes: ['New boards start with Backlog, Todo, In progress, Done, and Canceled.'],
        positionals: [],
        run: (args) => runBoardCreate(args, defaultDeps()),
        summary: 'Create a board with the default columns',
        usage: 'haus board create --key <key> --name <text>',
    },
    {
        examples: [
            'haus board columns SEC add --name Blocked --category active',
            'haus board columns SEC rename --column Blocked --name Waiting',
            'haus board columns SEC move --column Waiting --position 2',
            'haus board columns SEC remove --column Waiting --move-to Todo',
        ],
        flags: [
            {
                description: 'The column to change, by name',
                name: '--column',
                valueName: '<name>',
            },
            {
                description: 'New column name, for add and rename',
                name: '--name',
                valueName: '<text>',
            },
            {
                description: `Category for add: ${columnCategories.join(', ')}`,
                name: '--category',
                valueName: '<category>',
            },
            {
                description: 'Place in the board, from 1, for add and move',
                name: '--position',
                valueName: '<n>',
            },
            {
                description: 'Where a removed column’s Tasks go; required when it holds Tasks',
                name: '--move-to',
                valueName: '<column>',
            },
        ],
        name: 'columns',
        notes: [
            'A new column without --position lands after the last column of its category.',
            'A board keeps at least one todo, active, and done column.',
            'Fails instead of overwriting when the board changed since it was read; run it again.',
        ],
        positionals: ['<key>', '<add|rename|move|remove>'],
        run: (args) => runBoardColumns(args, defaultDeps()),
        summary: "Add, rename, reorder, or remove a board's columns",
        usage: 'haus board columns <key> add --name <text> --category <category> [--position <n>] | rename --column <name> --name <text> | move --column <name> --position <n> | remove --column <name> [--move-to <column>]',
    },
];

export async function runBoardList(_args: ParsedArgs, deps: BoardDeps): Promise<number> {
    const { boards } = await deps.client.request('/api/agent/boards', boardListSchema, {
        method: 'GET',
    });
    deps.write(`${boards.map(describeBoard).join('\n')}\n`);
    return 0;
}

export async function runBoardCreate(args: ParsedArgs, deps: BoardDeps): Promise<number> {
    const { board } = await deps.client.request('/api/agent/boards/create', boardSingleSchema, {
        body: { key: requiredValue(args, '--key'), name: requiredValue(args, '--name') },
        method: 'POST',
    });
    deps.write(`Created board ${describeBoard(board)}\n`);
    return 0;
}

function defaultDeps(): BoardDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
