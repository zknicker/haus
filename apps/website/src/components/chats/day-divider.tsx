import { Chip } from '@heroui/react';

import { cn } from '../../lib/utils.ts';

function sameDay(left: Date, right: Date) {
    return (
        left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate()
    );
}

export function formatDayLabel(value: string | Date) {
    const date = typeof value === 'string' ? new Date(value) : value;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(date, today)) {
        return 'Today';
    }

    if (sameDay(date, yesterday)) {
        return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Day marker for the transcript: a hairline broken by a centered chip. The
 * hairline is split into two flex rules rather than drawn behind the chip so
 * the chip needs no opaque backplate of its own.
 */
export function DayDivider({ className, label }: { className?: string; label: string }) {
    return (
        <div
            className={cn('relative flex min-w-0 items-center gap-3 py-0.5', className)}
            data-slot="day-divider"
        >
            <span aria-hidden className="border-separator min-w-6 flex-1 border-t" />
            <Chip color="accent" size="sm" variant="soft">
                {label}
            </Chip>
            <span aria-hidden className="border-separator min-w-6 flex-1 border-t" />
        </div>
    );
}
