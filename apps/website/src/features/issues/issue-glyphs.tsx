import type { IssuePriority, IssueState } from '@haus/api';
import { cn } from '../../lib/utils.ts';
import { TaskStatusDisc } from '../tasks/task-status-disc.tsx';
import { issuePriorityLabels, issueStateDiscs, issueStateLabels } from './issue-state.ts';

const glyphSize = 'size-[15px]';

const bars = [
    { height: 5, x: 2, y: 9 },
    { height: 8, x: 6.5, y: 6 },
    { height: 11, x: 11, y: 3 },
];

const filledBars: Record<Exclude<IssuePriority, 'urgent'>, number> = {
    high: 3,
    low: 1,
    normal: 2,
};

export function IssueStateDisc({ className, state }: { className?: string; state: IssueState }) {
    return <TaskStatusDisc className={className} status={issueStateDiscs[state]} />;
}

export function IssueStateMark({ state }: { state: IssueState }) {
    return (
        <span aria-label={issueStateLabels[state]} className="inline-flex shrink-0" role="img">
            <IssueStateDisc state={state} />
        </span>
    );
}

export function IssuePriorityMark({ priority }: { priority: IssuePriority }) {
    return (
        <span
            aria-label={`${issuePriorityLabels[priority]} priority`}
            className="inline-flex shrink-0"
            role="img"
        >
            <IssuePriorityIcon className="text-muted" priority={priority} />
        </span>
    );
}

export function IssuePriorityIcon({
    className,
    priority,
}: {
    className?: string;
    priority: IssuePriority;
}) {
    if (priority === 'urgent') {
        return (
            <svg
                aria-hidden="true"
                className={cn(glyphSize, 'shrink-0', className, 'text-[var(--label-orange-fg)]')}
                viewBox="0 0 16 16"
            >
                <rect fill="currentColor" height="13" rx="3.5" width="13" x="1.5" y="1.5" />
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
