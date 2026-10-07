import { Button } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { formatShortTime } from '../../../lib/format.ts';
import { cn } from '../../../lib/utils.ts';
import { barTone } from '../../turn-trace/turn-trace-grid.tsx';
import { type ActivityLogDay, timelineStatus } from './agent-activity-log-entries.ts';
import { ActivityLogDayOutlines } from './agent-activity-log-outlines.tsx';
import {
    buildDayTimeline,
    type TimelineBlock,
    type TimelineStatus,
} from './agent-activity-log-overview-model.ts';
import {
    OverviewReadout,
    OverviewRuler,
    useIsStuck,
    useWidth,
} from './agent-activity-log-overview-parts.tsx';
import { useActivityLogStores, useLinkedHover, useStepMarks } from './agent-activity-log-stores.ts';
import type { TurnDetailAccess } from './agent-activity-model.ts';
import { formatTurnDuration } from './agent-turn-row-model.ts';

/**
 * The day being read, as one strip pinned over
 * the log: every turn a block of one height at its real time on a dotted
 * lane, its steps drawn inside once read, idle stretches folded to a
 * broken-axis mark, today running out to now. Pointing at a block lights its
 * rows and names it in the readout; pressing it opens the turn and brings it
 * into view. Pointing at a row lights its block, and a step's own span.
 */
export function ActivityLogOverview({
    access,
    action,
    day,
    newer,
    now,
    older,
    onDayChange,
    serverId,
}: {
    access: TurnDetailAccess;
    action?: React.ReactNode;
    day: ActivityLogDay;
    newer: ActivityLogDay | null;
    now: number;
    older: ActivityLogDay | null;
    onDayChange: (day: ActivityLogDay) => void;
    serverId: string;
}) {
    const { hover } = useActivityLogStores();
    const [width, ref] = useWidth();
    const turns = day.entries.map((entry) => entry.row.latest);
    const isToday = turns.some(
        (turn) => new Date(turn.startedAt).toDateString() === new Date(now).toDateString()
    );
    const percent = (pixels: number) => (width > 0 ? (pixels / width) * 100 : 0);
    const timeline = buildDayTimeline(
        turns.map((turn) => ({
            endMs: turn.kind === 'active' ? now : Date.parse(turn.startedAt) + turn.durationMs,
            runId: turn.runId,
            startMs: Date.parse(turn.startedAt),
            status: timelineStatus(turn),
        })),
        now,
        isToday,
        { blockGap: percent(2), labelGap: width > 0 ? percent(58) : 9, minBlock: percent(8) }
    );
    const workedMs = turns.reduce(
        (sum, turn) =>
            sum + (turn.kind === 'active' ? now - Date.parse(turn.startedAt) : turn.durationMs),
        0
    );
    const failed = turns.filter((turn) => timelineStatus(turn) === 'failed').length;
    const startedAtByRun = new Map(turns.map((turn) => [turn.runId, turn.startedAt]));
    const [isStuck, sentinel] = useIsStuck();

    return (
        <>
            {/* Scrolls out of view the moment the log scrolls under the band. */}
            <span aria-hidden className="h-px" ref={sentinel} />
            <ActivityLogDayOutlines access={access} day={day} serverId={serverId} />
            <section
                aria-label={`${day.label} overview`}
                className={cn(
                    'sticky top-0 z-10 -mt-px grid gap-1.5 border-b bg-background px-(--trace-pad) pt-2 pb-1',
                    'transition-colors duration-150 motion-reduce:transition-none',
                    isStuck ? 'border-separator' : 'border-transparent'
                )}
                data-log-overview
                data-stuck={isStuck || undefined}
                ref={ref}
            >
                <div className="flex min-w-0 items-center gap-1">
                    <Button
                        aria-label={older ? `Show ${older.label}` : 'No earlier days'}
                        isDisabled={!older}
                        isIconOnly
                        onPress={() => older && onDayChange(older)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={ArrowLeft01Icon} size={16} />
                    </Button>
                    <Button
                        aria-label={newer ? `Show ${newer.label}` : 'No later days'}
                        isDisabled={!newer}
                        isIconOnly
                        onPress={() => newer && onDayChange(newer)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon icon={ArrowRight01Icon} size={16} />
                    </Button>
                    <h3 aria-live="polite" className="ms-1 shrink-0 font-medium text-sm">
                        {day.label}
                    </h3>
                    <OverviewReadout day={day}>
                        {turns.length === 1 ? '1 turn' : `${turns.length} turns`}
                        {` · ${formatTurnDuration(workedMs)} working`}
                        {failed > 0 ? (
                            <span className="text-danger">{` · ${failed} failed`}</span>
                        ) : null}
                    </OverviewReadout>
                    {action}
                </div>
                {/* Below 42rem the strip's folded breaks crowd; the day bar carries the day. */}
                <div
                    className="relative @max-2xl/activity-log:hidden h-6"
                    onPointerLeave={() => hover.set(null)}
                >
                    {timeline.spans.map((span) => (
                        <span
                            aria-hidden
                            className="absolute top-1/2 border-border border-t border-dotted"
                            key={`lane-${span.left}`}
                            style={{ left: `${span.left}%`, width: `${span.width}%` }}
                        />
                    ))}
                    {timeline.blocks.map((block) => (
                        <TimelineTurn
                            block={block}
                            key={block.runId}
                            startedAt={startedAtByRun.get(block.runId) ?? ''}
                        />
                    ))}
                    {timeline.isToday ? (
                        <span aria-hidden className="absolute inset-y-0 end-0 w-px bg-accent" />
                    ) : null}
                </div>
                <OverviewRuler
                    breaks={timeline.breaks}
                    spans={timeline.spans}
                    ticks={timeline.ticks}
                />
            </section>
        </>
    );
}

function TimelineTurn({ block, startedAt }: { block: TimelineBlock; startedAt: string }) {
    const { hover, reveal } = useActivityLogStores();
    const linked = useLinkedHover();
    const marks = useStepMarks(block.runId);
    const isLinked = linked?.runId === block.runId;
    const span = isLinked && linked.source === 'row' ? linked.span : null;

    return (
        <button
            aria-label={`${statusLabels[block.status]} turn at ${formatShortTime(startedAt)}`}
            className="absolute inset-y-0 flex cursor-(--cursor-interactive) items-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => reveal(block.runId)}
            onFocus={() => hover.set({ runId: block.runId, source: 'overview', span: null })}
            onPointerEnter={() => hover.set({ runId: block.runId, source: 'overview', span: null })}
            style={{ left: `${block.left}%`, width: `${block.width}%` }}
            type="button"
        >
            <span
                className={cn(
                    'relative h-4 w-full overflow-hidden rounded-xs',
                    // Cut from the lane like a waterfall bar from its leader.
                    'shadow-[0_0_0_2px_var(--trace-ground)] transition-[opacity,box-shadow] duration-150 motion-reduce:transition-none',
                    // Solid: the quiet tone over the ground, so the lane never shows through.
                    'bg-background',
                    isLinked &&
                        'shadow-[0_0_0_2px_var(--trace-ground),0_0_0_3px_var(--foreground)]',
                    linked && !isLinked && 'opacity-45'
                )}
            >
                <span className="absolute inset-0 bg-trace-quiet" />
                {marks?.map((mark, index) => (
                    <span
                        className={cn('absolute inset-y-0 min-w-px', barTone(mark))}
                        // biome-ignore lint/suspicious/noArrayIndexKey: marks follow the turn's step order.
                        key={index}
                        style={{ left: `${mark.start * 100}%`, width: `${mark.width * 100}%` }}
                    />
                ))}
                {statusStripes[block.status] ? (
                    <span
                        className={cn(
                            'absolute inset-x-0 bottom-0 h-0.5',
                            statusStripes[block.status]
                        )}
                    />
                ) : null}
                {block.status === 'working' ? (
                    <span className="absolute inset-y-0 end-0 w-1 bg-accent motion-safe:animate-pulse" />
                ) : null}
                {span ? (
                    <span
                        className="absolute inset-y-0 min-w-0.5 bg-foreground"
                        style={{ left: `${span.start * 100}%`, width: `${span.width * 100}%` }}
                    />
                ) : null}
            </span>
        </button>
    );
}

/** Every turn rests on one calm neutral; status speaks, as a stripe, only where it is news. */
const statusStripes: Record<TimelineStatus, string | null> = {
    completed: null,
    failed: 'bg-danger',
    interrupted: 'bg-warning',
    working: null,
};

const statusLabels: Record<TimelineStatus, string> = {
    completed: 'Completed',
    failed: 'Failed',
    interrupted: 'Interrupted',
    working: 'Working',
};
