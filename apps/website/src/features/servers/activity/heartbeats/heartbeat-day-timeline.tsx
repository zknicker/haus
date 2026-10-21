import type { HeartbeatMark } from '@haus/api';
import { Link } from 'react-router-dom';
import { cn } from '../../../../lib/utils.ts';
import { type GlyphKind, glyphLabels, readGlyphKind } from './heartbeat-marks-model.ts';
import { type DayWindow, readNightBands, readTrackPosition } from './heartbeats-model.ts';

const dotColors: Record<GlyphKind, string> = {
    dream: 'bg-dream',
    failed: 'bg-danger',
    paused: 'bg-warning',
    quiet: 'bg-muted/50',
    reported: 'bg-accent',
    running: 'bg-accent',
    skipped: 'bg-muted/30',
    yielded: 'bg-muted',
};

/**
 * An Agent's day in 120 by 14 pixels: a hairline with a dot per check-in in its
 * outcome's color, night faint at both ends, the post's own run larger. It is a
 * link to that run in the Activity log.
 */
export function HeartbeatDayTimeline({
    agentName,
    currentRunId,
    marks,
    to,
    window,
}: {
    agentName: string;
    currentRunId: string | null;
    marks: readonly HeartbeatMark[];
    to: string;
    window: DayWindow;
}) {
    const bands = readNightBands(window);
    return (
        <Link
            aria-label={`${agentName}'s ${marks.length === 1 ? 'check-in' : `${marks.length} check-ins`} today, open in the Log`}
            className="relative block h-3.5 w-[120px] shrink-0 rounded-sm"
            data-heartbeat-timeline=""
            title="Open in the Log"
            to={to}
        >
            <span aria-hidden className="absolute inset-x-1 inset-y-0">
                <span className="absolute inset-x-0 top-1/2 h-px bg-separator" />
                {bands.map((band) => (
                    <span
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-default"
                        key={band.left}
                        style={{ left: `${band.left}%`, width: `${band.width}%` }}
                    />
                ))}
                {marks.map((mark) => (
                    <Dot
                        isCurrent={mark.runId !== null && mark.runId === currentRunId}
                        key={mark.at}
                        mark={mark}
                        window={window}
                    />
                ))}
            </span>
        </Link>
    );
}

function Dot({
    isCurrent,
    mark,
    window,
}: {
    isCurrent: boolean;
    mark: HeartbeatMark;
    window: DayWindow;
}) {
    const kind = readGlyphKind(mark);
    return (
        <span
            className={cn(
                'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                dotColors[kind],
                isCurrent ? 'z-10 size-2 ring-2 ring-background' : 'size-1.5'
            )}
            data-kind={glyphLabels[kind]}
            style={{ left: `${readTrackPosition(Date.parse(mark.at), window)}%` }}
        />
    );
}
