import type { HeartbeatMark } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { formatShortTime } from '../../../../lib/format.ts';
import { cn } from '../../../../lib/utils.ts';
import { outcomeLabels, readKindLabel, readMarkAriaLabel } from './heartbeats-model.ts';

/**
 * One slot on an Agent's lane: a button at its time that selects the mark.
 * Shape and fill read the outcome without color alone: a quiet ring, a filled
 * reported dot, a half-filled yielded dot, a dashed skipped ring, a heavy
 * warning ring for paused. A dream is a diamond, the one shape no daytime
 * heartbeat takes (no violet token exists, so it keeps the accent).
 */
export function HeartbeatMarkButton({
    agentName,
    isSelected,
    left,
    mark,
    onSelect,
}: {
    agentName: string;
    isSelected: boolean;
    left: number;
    mark: HeartbeatMark;
    onSelect: () => void;
}) {
    const isDream = mark.kind === 'nightly';
    return (
        <Tooltip delay={0}>
            <Tooltip.Trigger>
                <button
                    aria-label={readMarkAriaLabel(agentName, mark)}
                    aria-pressed={isSelected}
                    className={cn(
                        'absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-(--cursor-interactive) items-center justify-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        isSelected && 'bg-default'
                    )}
                    onClick={onSelect}
                    style={{ left: `${left}%` }}
                    type="button"
                >
                    <span
                        aria-hidden
                        className={cn(
                            isDream ? 'size-2.5 rotate-45 rounded-xs' : 'size-2.5 rounded-full',
                            glyphClass[mark.outcome]
                        )}
                    />
                </button>
            </Tooltip.Trigger>
            <Tooltip.Content>
                {`${formatShortTime(mark.at)} ${readKindLabel(mark)} · ${outcomeLabels[mark.outcome]}`}
            </Tooltip.Content>
        </Tooltip>
    );
}

const glyphClass: Record<HeartbeatMark['outcome'], string> = {
    failed: 'bg-danger',
    paused: 'border-2 border-warning bg-background',
    quiet: 'border border-muted bg-background',
    reported: 'bg-accent',
    running: 'border border-accent bg-background motion-safe:animate-pulse',
    skipped: 'border border-muted border-dashed bg-background',
    yielded: 'border border-accent bg-linear-to-r from-accent from-50% to-background to-50%',
};
