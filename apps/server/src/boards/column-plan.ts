import { type BoardColumnDraft, type ColumnCategory, requiredColumnCategories } from '@haus/api';
import { BoardInvariantError } from './board-errors.ts';

export interface StoredBoardColumn {
    category: ColumnCategory;
    id: string;
    name: string;
}

export interface ColumnPlan {
    /** New columns, with their final positions. */
    created: { category: ColumnCategory; name: string; position: number }[];
    /** Existing columns that stay, with their final name, category, and position. */
    kept: { category: ColumnCategory; id: string; name: string; position: number }[];
    /** Each removed column that holds Tasks, and the kept column they move to. */
    moves: { from: string; to: string }[];
    removed: string[];
}

/**
 * Plans `board.setColumns`, the whole-list replace (ADR 0051), and checks every
 * invariant before anything is written: each draft id is one of the board's
 * columns, named once; names are unique case-insensitively; the required
 * categories are present; and every removed column that holds Tasks maps to a
 * column that stays.
 */
export function planBoardColumns(input: {
    drafts: readonly BoardColumnDraft[];
    existing: readonly StoredBoardColumn[];
    moveTasks: Readonly<Record<string, string>>;
    /** Task counts per existing column id. */
    taskCounts: ReadonlyMap<string, number>;
}): ColumnPlan {
    const existingIds = new Set(input.existing.map((column) => column.id));
    const draftIds = new Set<string>();
    const names = new Set<string>();
    const plan: ColumnPlan = { created: [], kept: [], moves: [], removed: [] };

    for (const [position, draft] of input.drafts.entries()) {
        const folded = draft.name.toLocaleLowerCase('en-US');
        if (names.has(folded)) {
            throw new BoardInvariantError(`Column names must be unique: "${draft.name}" repeats.`);
        }
        names.add(folded);
        if (draft.id === undefined) {
            plan.created.push({ category: draft.category, name: draft.name, position });
            continue;
        }
        if (!existingIds.has(draft.id) || draftIds.has(draft.id)) {
            throw new BoardInvariantError(
                `Column ${draft.id} is not a column of this board, or appears twice.`
            );
        }
        draftIds.add(draft.id);
        plan.kept.push({ category: draft.category, id: draft.id, name: draft.name, position });
    }

    const categories = new Set(input.drafts.map((draft) => draft.category));
    const missing = requiredColumnCategories.filter((category) => !categories.has(category));
    if (missing.length > 0) {
        throw new BoardInvariantError(
            `A board needs at least one column in each of todo, active, and done; missing ${missing.join(', ')}.`
        );
    }

    plan.removed = input.existing.map((column) => column.id).filter((id) => !draftIds.has(id));
    const removed = new Set(plan.removed);
    for (const from of Object.keys(input.moveTasks)) {
        if (!removed.has(from)) {
            throw new BoardInvariantError(`moveTasks names column ${from}, which is not removed.`);
        }
    }
    for (const from of plan.removed) {
        const to = input.moveTasks[from];
        if ((input.taskCounts.get(from) ?? 0) === 0) {
            continue;
        }
        if (to === undefined) {
            throw new BoardInvariantError(
                `Column ${from} still holds Tasks; map it to a remaining column in moveTasks.`
            );
        }
        if (!draftIds.has(to)) {
            throw new BoardInvariantError(
                `Tasks from column ${from} must move to an existing column that stays.`
            );
        }
        plan.moves.push({ from, to });
    }
    return plan;
}
