import { Button } from '@heroui/react';
import { ColumnCategoryDisc } from '../../tasks/column-category-disc.tsx';
import type { ResolvedTask } from './task-inbox-model.ts';

/** What a Task card leaves behind once resolved: one line where it sat, with its Undo. */
export function TaskResolvedRow({
    isUndoing,
    onUndo,
    resolved,
}: {
    isUndoing: boolean;
    onUndo: () => void;
    resolved: ResolvedTask;
}) {
    return (
        <output className="inbox-unread-row flex min-w-0 items-center gap-2 py-1.5 ps-4 pe-2 text-muted text-sm">
            <ColumnCategoryDisc category={resolved.column.category} className="size-3.5" />
            <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{resolved.item.task.key}</span> moved
                to {resolved.column.name}.
            </span>
            <Button
                className="ms-auto"
                isPending={isUndoing}
                onPress={onUndo}
                size="sm"
                variant="ghost"
            >
                Undo
            </Button>
        </output>
    );
}
