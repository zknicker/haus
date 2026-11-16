import {
    type Board,
    type BoardColumn,
    type BoardColumnDraft,
    type ColumnCategory,
    requiredColumnCategories,
} from '@haus/api';
import { columnCategoryLabels } from './column-category-disc.tsx';

/**
 * The Board settings draft. The Server checks every rule again in one
 * transaction (`boards/column-plan.ts`); these checks are what let the editor
 * lock a control or name the problem before anyone presses Save.
 */

/** A column being edited. `id` is the row's own; `savedId` is absent until the Server creates it. */
export interface ColumnDraft {
    category: ColumnCategory;
    id: string;
    name: string;
    savedId?: string;
}

/** A saved column the draft dropped, and the saved column its Tasks go to. */
export interface ColumnRemoval {
    id: string;
    name: string;
    targetId: null | string;
    taskCount: number;
}

export function toColumnDrafts(columns: readonly BoardColumn[]): ColumnDraft[] {
    return [...columns]
        .sort((a, b) => a.position - b.position)
        .map(({ category, id, name }) => ({ category, id, name, savedId: id }));
}

/** Whether taking this column away, or out of its category, would leave the category empty. */
export function isLastOfRequiredCategory(drafts: readonly ColumnDraft[], draft: ColumnDraft) {
    return (
        (requiredColumnCategories as readonly ColumnCategory[]).includes(draft.category) &&
        drafts.filter((candidate) => candidate.category === draft.category).length === 1
    );
}

/** What keeps the draft from saving, as the sentence to show; null when it can save. */
export function columnPlanProblem(
    drafts: readonly ColumnDraft[],
    removals: readonly ColumnRemoval[]
): null | string {
    if (drafts.some((draft) => !draft.name.trim())) {
        return 'Every column needs a name.';
    }
    const names = drafts.map((draft) => draft.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
        return 'Two columns share a name.';
    }
    const missing = requiredColumnCategories.find(
        (category) => !drafts.some((draft) => draft.category === category)
    );
    if (missing) {
        return `A board keeps at least one ${columnCategoryLabels[missing]} column.`;
    }
    const unplaced = removals.find(
        (removal) =>
            removal.taskCount > 0 && !drafts.some((draft) => draft.savedId === removal.targetId)
    );
    return unplaced ? `Choose where the Tasks in ${unplaced.name} go.` : null;
}

/** Whether the draft differs from the saved columns, order included. */
export function columnsChanged(board: Board, drafts: readonly ColumnDraft[]) {
    const saved = toColumnDrafts(board.columns);
    return (
        saved.length !== drafts.length ||
        saved.some((column, index) => {
            const draft = drafts[index];
            return (
                draft?.savedId !== column.id ||
                draft.name.trim() !== column.name ||
                draft.category !== column.category
            );
        })
    );
}

/** The `board.setColumns` payload. Only a removal still holding Tasks needs a destination. */
export function columnPlanInput(
    drafts: readonly ColumnDraft[],
    removals: readonly ColumnRemoval[]
): { columns: BoardColumnDraft[]; moveTasks: Record<string, string> } {
    const moveTasks: Record<string, string> = {};
    for (const removal of removals) {
        if (removal.taskCount > 0 && removal.targetId) {
            moveTasks[removal.id] = removal.targetId;
        }
    }
    return {
        columns: drafts.map(({ category, name, savedId }) => ({
            category,
            ...(savedId ? { id: savedId } : {}),
            name: name.trim(),
        })),
        moveTasks,
    };
}

/** Moves one column to where another sits, for a drag that lands before or after it. */
export function reorderColumnDrafts(
    drafts: readonly ColumnDraft[],
    movedId: string,
    targetId: string,
    position: 'after' | 'before'
): ColumnDraft[] {
    const moved = drafts.find((draft) => draft.id === movedId);
    if (!moved || movedId === targetId) {
        return [...drafts];
    }
    const rest = drafts.filter((draft) => draft.id !== movedId);
    const index = rest.findIndex((draft) => draft.id === targetId);
    const insertAt = position === 'before' ? index : index + 1;
    return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
}

/** A key from a board's name: its initials for several words, its head for one. */
export function suggestBoardKey(name: string) {
    const words = name
        .toUpperCase()
        .split(/[^A-Z0-9]+/u)
        .filter(Boolean);
    const key = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '');
    return key.replace(/^[0-9]+/u, '').slice(0, words.length > 1 ? 5 : 3);
}
