import type * as React from 'react';
import { cn } from '../../../lib/utils.ts';
import { barTone } from '../../turn-trace/turn-trace-grid.tsx';
import type { TimelineStatus } from './agent-activity-log-overview-model.ts';
import { useStepMarks } from './agent-activity-log-stores.ts';

/**
 * A collapsed run's whole timeline as one strip: its step marks over its
 * duration, drawn like a block of the day overview. What a closed row shows in
 * place of its step chart (the Heartbeats view; the Log keeps its rows closed
 * and bare).
 */
export function TurnSummaryStrip({
    runId,
    status,
}: {
    runId: string;
    status: TimelineStatus;
}): React.ReactNode {
    const marks = useStepMarks(runId);
    return (
        <div
            aria-hidden
            className="pe-(--trace-pad) pt-1.5 pb-1"
            data-log-summary-strip
            style={{ paddingInlineStart: 'calc(var(--trace-lead) + var(--trace-pad))' }}
        >
            <span className="relative block h-3 overflow-hidden rounded-xs bg-trace-quiet">
                {marks?.map((mark, index) => (
                    <span
                        className={cn('absolute inset-y-0 min-w-px', barTone(mark))}
                        // biome-ignore lint/suspicious/noArrayIndexKey: marks follow the turn's step order.
                        key={index}
                        style={{ left: `${mark.start * 100}%`, width: `${mark.width * 100}%` }}
                    />
                ))}
                {status === 'failed' ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-danger" />
                ) : null}
                {status === 'working' ? (
                    <span className="absolute inset-y-0 end-0 w-1 bg-accent motion-safe:animate-pulse" />
                ) : null}
            </span>
        </div>
    );
}
