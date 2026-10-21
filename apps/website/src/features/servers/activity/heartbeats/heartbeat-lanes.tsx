import { cn } from '../../../../lib/utils.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatLane, laneRowClass } from './heartbeat-lane.tsx';
import {
    type DayWindow,
    type LaneView,
    readHourTicks,
    readNightBands,
    readTrackPosition,
} from './heartbeats-model.ts';

/**
 * The day, one lane per Agent on a shared 24-hour axis: night bands behind the
 * track, a mark at each slot's time, today's Now line, the lane's tokens at the
 * end. The lanes are the day's summary; the ruler hangs from the same
 * baseline idiom as the log's overview strip.
 */
export function HeartbeatLanes({
    agents,
    isToday,
    lanes,
    nowMs,
    onSelect,
    selectedKey,
    window,
}: {
    agents: ReadonlyMap<string, ActivityLogAgent>;
    isToday: boolean;
    lanes: readonly LaneView[];
    nowMs: number;
    onSelect: (key: string, runId: string | null) => void;
    selectedKey: string | null;
    window: DayWindow;
}) {
    const bands = readNightBands(window);
    const nowAt = isToday ? readTrackPosition(nowMs, window) : null;
    return (
        <div className="border-separator border-b pb-2">
            <div className="grid gap-1">
                <div aria-hidden className={cn(laneRowClass, 'h-6')}>
                    <span />
                    <HourRuler nowAt={nowAt} window={window} />
                    <span />
                </div>
                {lanes.map((laneView) => (
                    <HeartbeatLane
                        agent={agents.get(laneView.agentId)}
                        bands={bands}
                        key={laneView.agentId}
                        laneView={laneView}
                        nowAt={nowAt}
                        onSelect={onSelect}
                        selectedKey={selectedKey}
                        window={window}
                    />
                ))}
            </div>
        </div>
    );
}

function HourRuler({ nowAt, window }: { nowAt: number | null; window: DayWindow }) {
    return (
        <div className="relative h-full">
            {readHourTicks(window).map((tick) => (
                <span key={tick.at}>
                    <span
                        className={cn(
                            'absolute top-0 w-px bg-separator',
                            tick.label ? 'h-1.5' : 'h-1'
                        )}
                        style={{ left: `${tick.at}%` }}
                    />
                    {tick.label ? (
                        <span
                            className={cn(
                                'absolute top-2 whitespace-nowrap text-muted text-sm tabular-nums leading-none',
                                tick.at > 0 && '-translate-x-1/2'
                            )}
                            style={{ left: `${tick.at}%` }}
                        >
                            {tick.label}
                        </span>
                    ) : null}
                </span>
            ))}
            {nowAt === null ? null : (
                <span className="absolute top-0 h-2 w-px bg-accent" style={{ left: `${nowAt}%` }} />
            )}
        </div>
    );
}
