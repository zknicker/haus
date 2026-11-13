import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * The fixed category every board column maps to (ADR 0051). Code and Agents
 * reason about the category; the column name is presentation.
 */
export const columnCategories = ['backlog', 'todo', 'active', 'done', 'canceled'] as const;

export type ColumnCategory = (typeof columnCategories)[number];

export const columnCategorySchema = z.enum(columnCategories);

/** The categories a Task counts as open in: the default Agent list and a board's open count. */
export const openColumnCategories = [
    'backlog',
    'todo',
    'active',
] as const satisfies readonly ColumnCategory[];

/** The categories a Task is finished in; entering one sets `completedAt`. */
export const closedColumnCategories = [
    'done',
    'canceled',
] as const satisfies readonly ColumnCategory[];

/** A board always keeps at least one column in each of these. Server enforces it. */
export const requiredColumnCategories = [
    'todo',
    'active',
    'done',
] as const satisfies readonly ColumnCategory[];

/** The columns a new board starts with, in order. */
export const defaultBoardColumns = [
    { category: 'backlog', name: 'Backlog' },
    { category: 'todo', name: 'Todo' },
    { category: 'active', name: 'In progress' },
    { category: 'done', name: 'Done' },
    { category: 'canceled', name: 'Canceled' },
] as const satisfies readonly { category: ColumnCategory; name: string }[];

/** Every Server's always-present board. */
export const GENERAL_BOARD_KEY = 'GEN';
export const GENERAL_BOARD_NAME = 'General';

export function isClosedColumnCategory(category: ColumnCategory): boolean {
    return (closedColumnCategories as readonly ColumnCategory[]).includes(category);
}

export const BOARD_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/u;
export const BOARD_NAME_MAX_CHARS = 60;
export const BOARD_COLUMN_NAME_MAX_CHARS = 40;

/** `SEC`: uppercase, 2–5 characters, unique per Server even when archived. */
export const boardKeySchema = z.string().trim().regex(BOARD_KEY_PATTERN, {
    message: 'A board key is 2–5 uppercase letters or digits, starting with a letter.',
});

export const boardNameSchema = z.string().trim().min(1).max(BOARD_NAME_MAX_CHARS);

export const boardColumnNameSchema = z.string().trim().min(1).max(BOARD_COLUMN_NAME_MAX_CHARS);

export const boardColumnSchema = z
    .object({
        category: columnCategorySchema,
        id: idSchema,
        name: boardColumnNameSchema,
        position: z.number().int().nonnegative(),
    })
    .strict();

export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardSchema = z
    .object({
        /** Archived boards leave default lists and refuse new Tasks. */
        archivedAt: timestampSchema.nullable(),
        /** In board order. */
        columns: z.array(boardColumnSchema),
        createdAt: timestampSchema,
        id: idSchema,
        key: boardKeySchema,
        name: boardNameSchema,
        /** Tasks in a `backlog`, `todo`, or `active` column. */
        openTaskCount: z.number().int().nonnegative(),
        serverId: idSchema,
        updatedAt: timestampSchema,
        version: z.number().int().positive(),
    })
    .strict();

export type Board = z.infer<typeof boardSchema>;

export const boardListInputSchema = z
    .object({
        includeArchived: z.boolean().default(false),
        serverId: idSchema,
    })
    .strict();

export const boardListSchema = z.array(boardSchema);

export const boardCreateInputSchema = z
    .object({
        key: boardKeySchema,
        name: boardNameSchema,
        serverId: idSchema,
    })
    .strict();

export const boardUpdateInputSchema = z
    .object({
        boardId: idSchema,
        expectedVersion: z.number().int().positive(),
        patch: z
            .object({
                /** Archive (true) or restore (false) the board. */
                archived: z.boolean().optional(),
                /** Re-keying a board re-keys every Task on it; keys are derived when read. */
                key: boardKeySchema.optional(),
                name: boardNameSchema.optional(),
            })
            .strict()
            .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one board field.'),
        serverId: idSchema,
    })
    .strict();

/** One column in a `board.setColumns` list. A missing `id` creates the column. */
export const boardColumnDraftSchema = z
    .object({
        category: columnCategorySchema,
        id: idSchema.optional(),
        name: boardColumnNameSchema,
    })
    .strict();

/**
 * `board.setColumns`: replace the whole ordered column list. Existing ids are
 * kept; an existing column left out is removed, and `moveTasks` maps each
 * removed column that holds Tasks to the column they move to. Server checks
 * the board invariants (required categories, case-insensitive unique names)
 * in one transaction.
 */
export const boardSetColumnsInputSchema = z
    .object({
        boardId: idSchema,
        columns: z.array(boardColumnDraftSchema),
        expectedVersion: z.number().int().positive(),
        moveTasks: z.record(idSchema, idSchema).optional(),
        serverId: idSchema,
    })
    .strict();

export const boardMutationResultSchema = z
    .object({
        board: boardSchema,
    })
    .strict();

/**
 * `board.onUpdated`: a board was created, renamed, re-keyed, archived, or had
 * its columns set. Every member. The App invalidates `board.list` and that
 * board's Task reads.
 */
export const boardUpdatedEventSchema = z
    .object({
        boardId: idSchema,
        serverId: idSchema,
        version: z.number().int().positive(),
    })
    .strict();

export type BoardListInput = z.infer<typeof boardListInputSchema>;
export type BoardCreateInput = z.infer<typeof boardCreateInputSchema>;
export type BoardUpdateInput = z.infer<typeof boardUpdateInputSchema>;
export type BoardColumnDraft = z.infer<typeof boardColumnDraftSchema>;
export type BoardSetColumnsInput = z.infer<typeof boardSetColumnsInputSchema>;
export type BoardMutationResult = z.infer<typeof boardMutationResultSchema>;
export type BoardUpdatedEvent = z.infer<typeof boardUpdatedEventSchema>;
