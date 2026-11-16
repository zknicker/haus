import { cn } from '../../lib/utils.ts';

// A literal size, not a spacing step: menus tighten their spacing scale, and
// a status glyph should not shrink just because the row around it did.
const glyphSize = 'size-[15px]';

import type { TaskPriority } from './task-presentation.ts';

// Bar heights for the Linear-style signal-strength glyph, tallest last.
const bars = [
    { height: 5, x: 2, y: 9 },
    { height: 8, x: 6.5, y: 6 },
    { height: 11, x: 11, y: 3 },
];

const filledBars: Record<Extract<TaskPriority, 'high' | 'low' | 'medium'>, number> = {
    high: 3,
    low: 1,
    medium: 2,
};

/**
 * Linear-style priority glyph: signal bars for low/medium/high, an
 * exclamation tile for urgent, faint dots when unset. Urgent always carries
 * the shared orange label token; everything else rides `currentColor` so call
 * sites set the hue (typically `text-muted`).
 */
export function TaskPriorityIcon({
    className,
    priority,
}: {
    className?: string;
    priority: TaskPriority;
}) {
    if (priority === 'urgent') {
        return (
            <svg
                aria-hidden="true"
                className={cn(glyphSize, 'shrink-0', className, 'text-[var(--label-orange-fg)]')}
                viewBox="0 0 16 16"
            >
                <rect fill="currentColor" height="13" rx="3.5" width="13" x="1.5" y="1.5" />
                {/* var(--surface) like the status disc: a white cutout washes
                    out against the pastel token fill in dark mode. */}
                <path
                    d="M8 4.5v4"
                    fill="none"
                    stroke="var(--surface)"
                    strokeLinecap="round"
                    strokeWidth="1.6"
                />
                <circle cx="8" cy="11.2" fill="var(--surface)" r="0.9" />
            </svg>
        );
    }

    if (priority === 'none') {
        return (
            <svg
                aria-hidden="true"
                className={cn(glyphSize, 'shrink-0', className)}
                viewBox="0 0 16 16"
            >
                {[3.5, 8, 12.5].map((cx) => (
                    <circle cx={cx} cy="8" fill="currentColor" key={cx} opacity="0.45" r="1" />
                ))}
            </svg>
        );
    }

    const filled = filledBars[priority];

    return (
        <svg
            aria-hidden="true"
            className={cn(glyphSize, 'shrink-0', className)}
            viewBox="0 0 16 16"
        >
            {bars.map((bar, index) => (
                <rect
                    fill="currentColor"
                    height={bar.height}
                    key={bar.x}
                    opacity={index < filled ? 1 : 0.28}
                    rx="1"
                    width="3"
                    x={bar.x}
                    y={bar.y}
                />
            ))}
        </svg>
    );
}
