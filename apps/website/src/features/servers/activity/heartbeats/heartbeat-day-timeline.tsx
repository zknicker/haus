import type { HeartbeatMark } from '@haus/api';
import { Link } from 'react-router-dom';
import { cn } from '../../../../lib/utils.ts';
import { type DayBounds, readTrackPosition } from './heartbeats-model.ts';

/**
 * An Agent's day in 96 by 12 pixels: a hairline with a dot per check-in in its
 * outcome's color, the post's own run larger. It sits in the post's header row
 * and links to that run in the Activity log.
 */
export function HeartbeatDayTimeline({
    agentName,
    currentRunId,
    day,
    marks,
    to,
}: {
    agentName: string;
    currentRunId: string | null;
    day: DayBounds;
    marks: readonly HeartbeatMark[];
    to: string;
}) {
    return (
        <Link
            aria-label={`${agentName}'s ${marks.length === 1 ? 'check-in' : `${marks.length} check-ins`} that day, open in the Log`}
            className="relative ms-auto block h-3 w-24 shrink-0 self-center rounded-sm"
            data-heartbeat-timeline=""
            title="Open in the Log"
            to={to}
        >
            <span aria-hidden className="absolute inset-x-1 inset-y-0">
                <span className="absolute inset-x-0 top-1/2 h-px bg-separator" />
                {marks.map((mark) => (
                    <span
                        className={cn(
                            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                            readDotColor(mark),
                            mark.runId !== null && mark.runId === currentRunId
                                ? 'z-10 size-2 ring-2 ring-background'
                                : 'size-1.5'
                        )}
                        key={`${mark.at}:${mark.runId}`}
                        style={{ left: `${readTrackPosition(Date.parse(mark.at), day)}%` }}
                    />
                ))}
            </span>
        </Link>
    );
}

function readDotColor(mark: HeartbeatMark): string {
    if (mark.kind === 'nightly') {
        return 'bg-dream';
    }
    switch (mark.outcome) {
        case 'failed':
            return 'bg-danger';
        case 'paused':
            return 'bg-warning';
        case 'reported':
        case 'running':
            return 'bg-accent';
        case 'skipped':
            return 'bg-muted/30';
        case 'yielded':
            return 'bg-muted';
        default:
            return 'bg-muted/50';
    }
}
