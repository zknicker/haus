import type { TaskLabel } from '@haus/api';
import { Chip } from '@heroui/react';
import { cn } from '../../lib/utils.ts';
import { taskLabelChipClass, taskLabelDotClass } from './label-colors.ts';

type TaskLabelColor = TaskLabel['color'];

// A colored label pill for Task rows and pickers. A soft Chip carrying the
// task-label palette: labels own their nine product colors rather than the
// chip status colors.
export function LabelChip({ color, name }: { color: TaskLabelColor; name: string }) {
    return (
        <Chip className={taskLabelChipClass[color]} size="sm" variant="soft">
            <LabelDot color={color} />
            <Chip.Label className="max-w-40 truncate">{name}</Chip.Label>
        </Chip>
    );
}

// A bare color dot for select rows and swatch buttons.
export function LabelDot({ className, color }: { className?: string; color: TaskLabelColor }) {
    return (
        <span
            className={cn('size-2.5 shrink-0 rounded-full', taskLabelDotClass[color], className)}
        />
    );
}
