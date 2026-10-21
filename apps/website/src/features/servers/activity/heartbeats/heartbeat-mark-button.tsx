import type { HeartbeatMark } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { cn } from '../../../../lib/utils.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { readGlyphKind, readMarkSummary } from './heartbeat-marks-model.ts';

/**
 * One slot on an Agent's lane: a button at its place on the track that selects
 * the mark. Its tooltip and label carry the exact time, outcome, run time and
 * tokens, so a nudged mark never misreports when it ran. The selected mark wears
 * a foreground ring; keyboard focus gets the focus ring on top of it.
 */
export function HeartbeatMarkButton({
    agentName,
    isSelected,
    isTabStop,
    left,
    mark,
    onSelect,
}: {
    agentName: string;
    isSelected: boolean;
    /** The lane's roving tab stop: one mark per lane is reachable by Tab. */
    isTabStop: boolean;
    left: number;
    mark: HeartbeatMark;
    onSelect: () => void;
}) {
    const summary = readMarkSummary(agentName, mark);
    const kind = readGlyphKind(mark);
    const isDream = kind === 'dream';
    return (
        <Tooltip delay={0}>
            <Tooltip.Trigger>
                <button
                    aria-label={summary}
                    aria-pressed={isSelected}
                    className={cn(
                        'absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-(--cursor-interactive) items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                        isDream ? 'size-8' : 'size-7',
                        isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-background'
                    )}
                    data-heartbeat-mark=""
                    onClick={onSelect}
                    style={{ left: `${left}%` }}
                    tabIndex={isTabStop ? 0 : -1}
                    type="button"
                >
                    <HeartbeatGlyph
                        isFailed={mark.outcome === 'failed'}
                        kind={kind}
                        size={isDream ? 26 : 22}
                    />
                </button>
            </Tooltip.Trigger>
            <Tooltip.Content>{summary}</Tooltip.Content>
        </Tooltip>
    );
}
