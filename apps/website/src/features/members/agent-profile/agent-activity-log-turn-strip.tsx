import type * as React from 'react';
import { cn } from '../../../lib/utils.ts';
import { barTone } from '../../turn-trace/turn-trace-grid.tsx';
import type { TraceKind } from '../../turn-trace/turn-trace-kind.ts';
import type { TimelineStatus } from './agent-activity-log-overview-model.ts';
import { useStepMarks } from './agent-activity-log-stores.ts';

/**
 * A collapsed run's whole timeline as one thin strip below its outcome: step
 * marks over its duration. At rest it is quiet (muted, kinds told apart by
 * opacity, only a failed step keeps a danger tick); the full-color strip shows
 * on row hover or focus. What a closed row shows in place of its step chart
 * (the Heartbeats view; the Log keeps its rows closed and bare).
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
            className="pe-(--trace-pad) pt-3 pb-1.5"
            data-log-summary-strip
            style={{ paddingInlineStart: 'calc(var(--trace-lead) + var(--trace-pad))' }}
        >
            <span className="relative block h-0.75 overflow-hidden rounded-full bg-foreground/5">
                <span className="absolute inset-0 group-focus-within/turn:opacity-0 group-hover/turn:opacity-0 motion-safe:transition-opacity">
                    {marks?.map((mark, index) => (
                        <span
                            className={cn(
                                'absolute inset-y-0 min-w-px',
                                mark.status === 'failed' ? 'bg-danger' : quietTone[mark.kind]
                            )}
                            // biome-ignore lint/suspicious/noArrayIndexKey: marks follow the turn's step order.
                            key={index}
                            style={{ left: `${mark.start * 100}%`, width: `${mark.width * 100}%` }}
                        />
                    ))}
                </span>
                <span className="absolute inset-0 opacity-0 group-focus-within/turn:opacity-100 group-hover/turn:opacity-100 motion-safe:transition-opacity">
                    {marks?.map((mark, index) => (
                        <span
                            className={cn('absolute inset-y-0 min-w-px', barTone(mark))}
                            // biome-ignore lint/suspicious/noArrayIndexKey: marks follow the turn's step order.
                            key={index}
                            style={{ left: `${mark.start * 100}%`, width: `${mark.width * 100}%` }}
                        />
                    ))}
                </span>
                {status === 'failed' ? (
                    <span className="absolute inset-y-0 end-0 w-0.5 bg-danger" />
                ) : null}
                {status === 'working' ? (
                    <span className="absolute inset-y-0 end-0 w-1 bg-accent motion-safe:animate-pulse" />
                ) : null}
            </span>
        </div>
    );
}

/** Quiet tones: one muted ink, kinds told apart by opacity steps. */
const quietTone: Record<TraceKind, string> = {
    file: 'bg-muted/45',
    haus: 'bg-muted/45',
    media: 'bg-muted/60',
    shell: 'bg-muted/45',
    subagent: 'bg-muted/60',
    thinking: 'bg-muted/25',
    tool: 'bg-muted/35',
    web: 'bg-muted/60',
};
