import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import { cn } from '../../../../lib/utils.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatMarkButton } from './heartbeat-mark-button.tsx';
import {
    type DayWindow,
    formatTokens,
    type LaneView,
    readHourTicks,
    readMarkKey,
    readNightBands,
    readTrackPosition,
} from './heartbeats-model.ts';

const rowClass =
    'grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 px-(--trace-pad) @min-2xl/heartbeats:grid-cols-[9rem_minmax(0,1fr)_3.5rem]';

/**
 * The day, one lane per Agent on a shared 24-hour axis: night bands behind the
 * track, a mark at each slot's time, today's Now line, the lane's tokens at the
 * end. The ruler hangs from the same baseline idiom as the log's overview strip.
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
    onSelect: (key: string) => void;
    selectedKey: string | null;
    window: DayWindow;
}) {
    const bands = readNightBands(window);
    const nowAt = isToday ? readTrackPosition(nowMs, window) : null;
    return (
        <div className="grid divide-y divide-separator border-separator border-b">
            <div aria-hidden className={cn(rowClass, 'h-5')}>
                <span />
                <HourRuler window={window} />
                <span />
            </div>
            {lanes.map(({ agentId, lane }) => {
                const agent = agents.get(agentId);
                const name = agent?.displayName ?? 'Agent';
                return (
                    <div className={cn(rowClass, 'h-9')} key={agentId}>
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                            <EntityAvatar name={name} size={16} src={agent?.avatarUrl} />
                            <span className="truncate font-medium">{name}</span>
                        </span>
                        <div className="relative h-6">
                            {bands.map((band) => (
                                <span
                                    aria-hidden
                                    className="absolute inset-y-1 rounded-sm bg-default/35"
                                    key={band.left}
                                    style={{ left: `${band.left}%`, width: `${band.width}%` }}
                                />
                            ))}
                            <span
                                aria-hidden
                                className="absolute inset-x-0 top-1/2 border-border border-t border-dotted"
                            />
                            {nowAt === null ? null : (
                                <span
                                    aria-hidden
                                    className="absolute inset-y-0 w-px bg-accent"
                                    style={{ left: `${nowAt}%` }}
                                />
                            )}
                            {lane.marks.map((mark) => {
                                const key = readMarkKey(agentId, mark);
                                return (
                                    <HeartbeatMarkButton
                                        agentName={name}
                                        isSelected={key === selectedKey}
                                        key={key}
                                        left={readTrackPosition(Date.parse(mark.at), window)}
                                        mark={mark}
                                        onSelect={() => onSelect(key)}
                                    />
                                );
                            })}
                        </div>
                        <span className="text-end text-muted text-xs tabular-nums">
                            {formatTokens(lane.tokens)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function HourRuler({ window }: { window: DayWindow }) {
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
                                'absolute top-2 whitespace-nowrap text-muted text-xs tabular-nums leading-none',
                                tick.at > 0 && '-translate-x-1/2'
                            )}
                            style={{ left: `${tick.at}%` }}
                        >
                            {tick.label}
                        </span>
                    ) : null}
                </span>
            ))}
        </div>
    );
}
