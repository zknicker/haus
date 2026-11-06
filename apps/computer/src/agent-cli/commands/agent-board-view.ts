import { columnCategories } from '@haus/api';
import * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';

// The board rows the Agent API returns, and how the CLI prints them.

export const columnCategorySchema = z.enum(columnCategories);

const boardColumnViewSchema = z.object({
    category: columnCategorySchema,
    id: z.string(),
    name: z.string(),
    position: z.number().int().nonnegative(),
});

const boardViewSchema = z.object({
    columns: z.array(boardColumnViewSchema),
    id: z.string(),
    key: z.string(),
    name: z.string(),
    openTaskCount: z.number().int().nonnegative(),
    version: z.number().int().positive(),
});

export const boardListSchema = z.object({ boards: z.array(boardViewSchema) });
export const boardSingleSchema = z.object({ board: boardViewSchema });

export type BoardView = z.infer<typeof boardViewSchema>;
export type BoardColumnView = z.infer<typeof boardColumnViewSchema>;

/** One board as a receipt: its key, name, open count, then its columns in order. */
export function describeBoard(board: BoardView): string {
    return `${board.key} "${board.name}" · ${board.openTaskCount} open · ${describeColumns(board.columns)}`;
}

/** Each column with its category, the word a Task's state is reasoned about in. */
export function describeColumns(columns: readonly BoardColumnView[]): string {
    return columns.map((column) => `${column.name} (${column.category})`).join(', ');
}

/** A column by id, or by name in any case, the way the Server resolves one. */
export function findBoardColumn(board: BoardView, value: string): BoardColumnView {
    const wanted = value.toLowerCase();
    const column = board.columns.find(
        (candidate) => candidate.id === value || candidate.name.toLowerCase() === wanted
    );
    if (!column) {
        throw new AgentCliError('INVALID_ARG', `Board ${board.key} has no column "${value}".`, {
            nextAction: `Its columns: ${describeColumns(board.columns)}.`,
        });
    }
    return column;
}

/** One unarchived board by key; archived boards take no column edits. */
export async function readBoard(client: AgentApiRequester, key: string): Promise<BoardView> {
    const { boards } = await client.request('/api/agent/boards', boardListSchema, {
        method: 'GET',
    });
    const board = boards.find((candidate) => candidate.key === key);
    if (!board) {
        throw new AgentCliError('BOARD_NOT_FOUND', `No board has the key ${key}.`, {
            nextAction: 'haus board list',
        });
    }
    return board;
}
