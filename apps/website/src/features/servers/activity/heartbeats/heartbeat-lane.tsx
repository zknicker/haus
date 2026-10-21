import { Badge } from '@heroui/react';
import type * as React from 'react';
import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatMarkButton } from './heartbeat-mark-button.tsx';
import { readLaneMarks } from './heartbeat-marks-model.ts';
import {
    type DayWindow,
    formatTokens,
    type LaneView,
    readMarkKey,
    type TrackBand,
} from './heartbeats-model.ts';

export const laneRowClass =
    'grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3 px-(--trace-pad) @min-2xl/heartbeats:grid-cols-[9rem_minmax(0,1fr)_3.5rem]';

/**
 * One Agent's lane: its name, a track with night bands, the Now line and a mark
 * per slot, and the lane's tokens. An Agent with nothing on the day keeps an
 * empty track. The marks are one roving tab stop; arrow keys walk them.
 */
export function HeartbeatLane({
    agent,
    bands,
    laneView: { agentId, lane },
    nowAt,
    onSelect,
    selectedKey,
    window,
}: {
    agent: ActivityLogAgent | undefined;
    bands: readonly TrackBand[];
    laneView: LaneView;
    nowAt: number | null;
    onSelect: (key: string) => void;
    selectedKey: string | null;
    window: DayWindow;
}) {
    const name = agent?.displayName ?? 'Agent';
    const marks = readLaneMarks(lane.marks, window).map((entry) => ({
        ...entry,
        key: readMarkKey(agentId, entry.mark),
    }));
    const tabKey = marks.find((entry) => entry.key === selectedKey)?.key ?? marks[0]?.key;
    return (
        <div className={`${laneRowClass} h-12`}>
            <span className="flex min-w-0 items-center gap-2.5 text-sm">
                <Badge.Anchor className="shrink-0" style={{ height: 34, width: 34 }}>
                    <EntityAvatar name={name} size={34} src={agent?.avatarUrl} />
                    {marks.length > 0 ? (
                        <Badge
                            color="default"
                            placement="bottom-right"
                            size="sm"
                            title={`${marks.length} runs today`}
                        >
                            {marks.length}
                        </Badge>
                    ) : null}
                </Badge.Anchor>
                <span className="truncate font-medium">{name}</span>
            </span>
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: a roving toolbar; the key handler walks the real buttons inside it */}
            <div
                aria-label={`${name} heartbeats`}
                className="relative h-full"
                onKeyDown={walkMarks}
                role="toolbar"
            >
                <div
                    aria-hidden
                    className="absolute inset-0 overflow-hidden rounded-lg bg-default/40"
                >
                    {bands.map((band) => (
                        <span
                            className="absolute inset-y-0 bg-default/50"
                            key={band.left}
                            style={{ left: `${band.left}%`, width: `${band.width}%` }}
                        />
                    ))}
                    {nowAt === null ? null : (
                        <span
                            className="absolute inset-y-0 w-px bg-accent"
                            style={{ left: `${nowAt}%` }}
                        />
                    )}
                </div>
                {marks.map(({ key, left, mark }) => (
                    <HeartbeatMarkButton
                        agentName={name}
                        isSelected={key === selectedKey}
                        isTabStop={key === tabKey}
                        key={key}
                        left={left}
                        mark={mark}
                        onSelect={() => onSelect(key)}
                    />
                ))}
            </div>
            <span className="text-end text-muted text-xs tabular-nums">
                {marks.length > 0 ? formatTokens(lane.tokens) : '—'}
            </span>
        </div>
    );
}

/** Left and right (Home and End too) move focus between a lane's marks. */
function walkMarks(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) {
        return;
    }
    const buttons = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-heartbeat-mark]'),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) {
        return;
    }
    const next = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        End: buttons.length - 1,
        Home: 0,
    }[event.key as 'ArrowLeft'];
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, next ?? index))]?.focus();
}
