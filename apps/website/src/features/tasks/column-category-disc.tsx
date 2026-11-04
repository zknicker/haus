import type { ColumnCategory } from '@haus/api';
import { cn } from '../../lib/utils.ts';
import type { ClaimStatus } from '../claims/claim-presentation.ts';
import { TaskStatusDisc } from './task-status-disc.tsx';

export const columnCategoryLabels: Record<ColumnCategory, string> = {
    active: 'Active',
    backlog: 'Backlog',
    canceled: 'Canceled',
    done: 'Done',
    todo: 'Todo',
};

const categoryDiscs: Record<Exclude<ColumnCategory, 'backlog'>, ClaimStatus> = {
    active: 'in_progress',
    canceled: 'closed',
    done: 'done',
    todo: 'todo',
};

/**
 * A column's category as the status disc: the claim glyphs carry over, and
 * Backlog, which a claim never had, is the same ring dashed: not started and
 * not yet asked for.
 */
export function ColumnCategoryDisc({
    category,
    className,
}: {
    category: ColumnCategory;
    className?: string;
}) {
    if (category !== 'backlog') {
        return <TaskStatusDisc className={className} status={categoryDiscs[category]} />;
    }
    return (
        <svg
            aria-hidden="true"
            className={cn('size-[15px] shrink-0 text-muted', className)}
            viewBox="0 0 16 16"
        >
            <circle
                cx="8"
                cy="8"
                fill="none"
                r="6"
                stroke="currentColor"
                strokeDasharray="2.2 2"
                strokeWidth="1.5"
            />
        </svg>
    );
}
