import { Separator } from '@heroui/react';
import { cn } from '../../lib/utils.ts';
import { TraceMicroLabel } from './turn-trace-blocks.tsx';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TurnTraceTotals } from './turn-trace-view.ts';

/**
 * The trace's totals, stated once, under its rows: each a tabular figure over
 * its micro label. The wall time closes the strip, labelled `Running` while
 * the turn works and `Done` once it settles. A count of zero is no fact.
 */
export function TurnTraceFooter({ totals }: { totals: TurnTraceTotals }) {
    const duration = formatTraceDuration(totals.durationMs, { isRunning: totals.isRunning });
    const counts = [
        stat('calls', totals.calls, 'Call', 'Calls'),
        stat('subagents', totals.subagents, 'Sub-agent', 'Sub-agents'),
        stat('images', totals.images, 'Image', 'Images'),
        stat('failed', totals.failed, 'Failed', 'Failed'),
    ].filter((entry) => entry !== null);

    return (
        <footer className="grid min-w-0 gap-2 pt-1" data-trace-footer>
            <Separator />
            <dl className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2 px-2">
                {counts.map((entry) => (
                    <TraceStat
                        isDanger={entry.key === 'failed'}
                        key={entry.key}
                        label={entry.label}
                        value={entry.value}
                    />
                ))}
                {duration ? (
                    <TraceStat
                        isTrailing
                        label={totals.isRunning ? 'Running' : 'Done'}
                        value={duration}
                    />
                ) : null}
            </dl>
        </footer>
    );
}

function TraceStat({
    isDanger = false,
    isTrailing = false,
    label,
    value,
}: {
    isDanger?: boolean;
    /** The wall time closes the strip at its end edge. */
    isTrailing?: boolean;
    label: string;
    value: string;
}) {
    return (
        <div
            className={cn('flex flex-col-reverse gap-0.5', isTrailing && 'ms-auto items-end')}
            data-trace-stat={label}
        >
            <dt>
                <TraceMicroLabel>{label}</TraceMicroLabel>
            </dt>
            <dd
                className={cn(
                    'font-medium text-sm tabular-nums',
                    isDanger ? 'text-danger' : 'text-foreground'
                )}
            >
                {value}
            </dd>
        </div>
    );
}

function stat(key: string, count: number, one: string, many: string) {
    return count > 0
        ? { key, label: count === 1 ? one : many, value: count.toLocaleString() }
        : null;
}
