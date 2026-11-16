import { columnCategories } from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { BoardDeps } from './agent-board.ts';
import {
    type BoardColumnView,
    type BoardView,
    boardSingleSchema,
    describeColumns,
    findBoardColumn,
    readBoard,
} from './agent-board-view.ts';
import { optionalInteger, requiredValue } from './agent-command-utils.ts';
import { taskListSchema } from './agent-task-view.ts';

type ColumnDraft = Pick<BoardColumnView, 'category' | 'name'> & { id?: string };

interface ColumnEdit {
    columns: ColumnDraft[];
    moveTasks?: Record<string, string>;
    receipt: string;
}

/**
 * One column edit, applied to the list the Server just returned and sent back whole: the route
 * replaces every column at once. It names the version it read, so an edit that landed in between
 * fails instead of being overwritten.
 */
export async function runBoardColumns(args: ParsedArgs, deps: BoardDeps): Promise<number> {
    const [key = '', action] = args.positionals;
    const board = await readBoard(deps.client, key);
    const edit = await planColumnEdit(action, args, board, deps.client);
    const response = await deps.client.request('/api/agent/boards/columns', boardSingleSchema, {
        body: {
            board: board.key,
            columns: edit.columns,
            expectedVersion: board.version,
            moveTasks: edit.moveTasks,
        },
        method: 'POST',
    });
    deps.write(
        `${edit.receipt}\nColumns on ${board.key}: ${describeColumns(response.board.columns)}\n`
    );
    return 0;
}

function planColumnEdit(
    action: string | undefined,
    args: ParsedArgs,
    board: BoardView,
    client: AgentApiRequester
): ColumnEdit | Promise<ColumnEdit> {
    switch (action) {
        case 'add':
            return planAdd(args, board);
        case 'rename':
            return planRename(args, board);
        case 'move':
            return planMove(args, board);
        case 'remove':
            return planRemove(args, board, client);
        default:
            throw new AgentCliError(
                'INVALID_ARG',
                `Unknown column edit "${action}". Use add, rename, move, or remove.`
            );
    }
}

function planAdd(args: ParsedArgs, board: BoardView): ColumnEdit {
    const name = requiredValue(args, '--name');
    const category = requiredCategory(args);
    const position = columnPosition(args, board.columns.length + 1);
    const index = position ? position - 1 : afterCategory(board, category);
    const columns: ColumnDraft[] = board.columns.map(toDraft);
    columns.splice(index, 0, { category, name });
    return { columns, receipt: `Added ${name} (${category}).` };
}

function planRename(args: ParsedArgs, board: BoardView): ColumnEdit {
    const column = findBoardColumn(board, requiredValue(args, '--column'));
    const name = requiredValue(args, '--name');
    return {
        columns: board.columns.map((entry) =>
            entry.id === column.id ? { ...toDraft(entry), name } : toDraft(entry)
        ),
        receipt: `Renamed ${column.name} to ${name}.`,
    };
}

function planMove(args: ParsedArgs, board: BoardView): ColumnEdit {
    const column = findBoardColumn(board, requiredValue(args, '--column'));
    const position = columnPosition(args, board.columns.length);
    if (position === undefined) {
        throw new AgentCliError('INVALID_ARG', '--position is required.');
    }
    const columns = board.columns.filter((entry) => entry.id !== column.id).map(toDraft);
    columns.splice(position - 1, 0, toDraft(column));
    return { columns, receipt: `Moved ${column.name} to position ${position}.` };
}

async function planRemove(
    args: ParsedArgs,
    board: BoardView,
    client: AgentApiRequester
): Promise<ColumnEdit> {
    const column = findBoardColumn(board, requiredValue(args, '--column'));
    const columns = board.columns.filter((entry) => entry.id !== column.id).map(toDraft);
    const moveTo = args.values['--move-to'];
    if (!moveTo) {
        await refuseIfHoldingTasks(board, column, client);
        return { columns, receipt: `Removed ${column.name}.` };
    }
    const target = findBoardColumn(board, moveTo);
    if (target.id === column.id) {
        throw new AgentCliError('INVALID_ARG', '--move-to must name a column that stays.');
    }
    return {
        columns,
        moveTasks: { [column.id]: target.id },
        receipt: `Removed ${column.name}; its Tasks moved to ${target.name}.`,
    };
}

/**
 * The route refuses this too, but by column id; asking first names the column and the flag. A
 * column with more Tasks than one page lists falls through to that refusal.
 */
async function refuseIfHoldingTasks(
    board: BoardView,
    column: BoardColumnView,
    client: AgentApiRequester
): Promise<void> {
    const { tasks } = await client.request('/api/agent/tasks', taskListSchema, {
        method: 'GET',
        query: { board: board.key, category: column.category },
    });
    if (tasks.some((task) => task.columnId === column.id)) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Column ${column.name} holds Tasks. Name the column they move to.`,
            {
                nextAction: `haus board columns ${board.key} remove --column "${column.name}" --move-to <column>`,
            }
        );
    }
}

function requiredCategory(args: ParsedArgs): BoardColumnView['category'] {
    const value = requiredValue(args, '--category');
    const category = columnCategories.find((candidate) => candidate === value);
    if (!category) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Unknown category ${value}. Use ${columnCategories.join(', ')}.`
        );
    }
    return category;
}

/** `--position` counts from 1 and may not leave a gap past the end of the list. */
function columnPosition(args: ParsedArgs, last: number): number | undefined {
    const position = optionalInteger(args, '--position', { minimum: 1 });
    if (position !== undefined && position > last) {
        throw new AgentCliError('INVALID_ARG', `--position must be between 1 and ${last}.`);
    }
    return position;
}

/** The slot after the last column of a category, or the end when the board has none. */
function afterCategory(board: BoardView, category: BoardColumnView['category']): number {
    const last = board.columns.map((column) => column.category).lastIndexOf(category);
    return last === -1 ? board.columns.length : last + 1;
}

function toDraft({ category, id, name }: BoardColumnView): ColumnDraft {
    return { category, id, name };
}
