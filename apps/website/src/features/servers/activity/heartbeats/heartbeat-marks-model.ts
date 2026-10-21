import type { HeartbeatMark } from '@haus/api';
import { formatShortTime } from '../../../../lib/format.ts';
import { formatTurnDuration } from '../../../members/agent-profile/agent-turn-row-model.ts';
import {
    type DayWindow,
    formatTokens,
    type HeartbeatOutcome,
    type LaneView,
    outcomeLabels,
    readTrackPosition,
} from './heartbeats-model.ts';

/**
 * How a mark is drawn on its lane. A dream is its own glyph whatever its
 * outcome; every heartbeat takes the glyph of how it ended.
 */
export type GlyphKind = HeartbeatOutcome | 'dream';

/** Legend order: the quiet baseline first, then what happened, then the dream. */
const glyphOrder: readonly GlyphKind[] = [
    'quiet',
    'reported',
    'yielded',
    'skipped',
    'paused',
    'running',
    'failed',
    'dream',
];

export const glyphLabels: Record<GlyphKind, string> = { ...outcomeLabels, dream: 'Dream' };

/** Marks closer than this on one lane (percent of the track) are nudged apart. */
export const minMarkGap = 3.4;

export function readGlyphKind(mark: Pick<HeartbeatMark, 'kind' | 'outcome'>): GlyphKind {
    return mark.kind === 'nightly' ? 'dream' : mark.outcome;
}

/** How many marks of each glyph kind are on the day, in legend order; absent kinds drop. */
export function readGlyphCounts(lanes: readonly LaneView[]): { count: number; kind: GlyphKind }[] {
    const counts = new Map<GlyphKind, number>();
    for (const { lane } of lanes) {
        for (const mark of lane.marks) {
            const kind = readGlyphKind(mark);
            counts.set(kind, (counts.get(kind) ?? 0) + 1);
        }
    }
    return glyphOrder.flatMap((kind) => {
        const count = counts.get(kind) ?? 0;
        return count > 0 ? [{ count, kind }] : [];
    });
}

/** Last night's dreams on the day: how many, the lessons they added, the promises they made. */
export function readDreamTotals(lanes: readonly LaneView[]): {
    dreams: number;
    lessons: number;
    promises: number;
} {
    const totals = { dreams: 0, lessons: 0, promises: 0 };
    for (const { lane } of lanes) {
        for (const mark of lane.marks) {
            if (mark.kind === 'nightly') {
                totals.dreams += 1;
                totals.lessons += mark.dream?.added ?? 0;
                totals.promises += mark.dream?.followUps ?? 0;
            }
        }
    }
    return totals;
}

/** The meta row under the detail header: time, duration, tokens (what is known). */
export function readMarkMeta(mark: HeartbeatMark): string[] {
    const tokens = formatTokens(mark.tokens);
    return [
        formatShortTime(mark.at),
        mark.durationMs === null ? null : formatTurnDuration(mark.durationMs),
        tokens === null ? null : `${tokens} tokens`,
    ].filter((part): part is string => part !== null);
}

/** A lane's marks in time order, each with its place on the track after nudging. */
export function readLaneMarks(
    marks: readonly HeartbeatMark[],
    window: DayWindow
): { left: number; mark: HeartbeatMark }[] {
    const ordered = marks
        .map((mark) => ({ at: readTrackPosition(Date.parse(mark.at), window), mark }))
        .sort((left, right) => left.at - right.at);
    const lefts = spreadPositions(ordered.map((entry) => entry.at));
    return ordered.map((entry, index) => ({ left: lefts[index] ?? entry.at, mark: entry.mark }));
}

/**
 * Positions (sorted ascending, in percent) pushed apart to at least `minMarkGap`,
 * kept inside the track: forward to clear the neighbor before, then back from
 * the end if the run spilled past it. Order never changes.
 */
export function spreadPositions(positions: readonly number[], gap = minMarkGap): number[] {
    const spread = [...positions];
    for (let index = 1; index < spread.length; index++) {
        spread[index] = Math.max(spread[index] ?? 0, (spread[index - 1] ?? 0) + gap);
    }
    const last = spread.length - 1;
    if ((spread[last] ?? 0) > 100) {
        spread[last] = 100;
        for (let index = last - 1; index >= 0; index--) {
            spread[index] = Math.min(spread[index] ?? 0, (spread[index + 1] ?? 0) - gap);
        }
    }
    return spread;
}

/** "Tiny · 2:07 pm · Reported · 41s · 18k tokens": the tooltip and the label. */
export function readMarkSummary(agentName: string, mark: HeartbeatMark): string {
    const tokens = formatTokens(mark.tokens);
    const outcome = outcomeLabels[mark.outcome];
    return [
        agentName,
        formatShortTime(mark.at),
        mark.kind === 'nightly' ? `Dream ${outcome.toLowerCase()}` : outcome,
        mark.durationMs === null ? null : formatTurnDuration(mark.durationMs),
        tokens === null ? null : `${tokens} tokens`,
    ]
        .filter(Boolean)
        .join(' · ');
}

/** The detail chip: the outcome's color, or the dream's own while a dream is well. */
export function readOutcomeChip(mark: Pick<HeartbeatMark, 'kind' | 'outcome'>): {
    color: 'accent' | 'danger' | 'default' | 'warning';
    isDream: boolean;
} {
    const base = (() => {
        if (mark.outcome === 'reported' || mark.outcome === 'running') {
            return 'accent' as const;
        }
        if (mark.outcome === 'failed') {
            return 'danger' as const;
        }
        return mark.outcome === 'paused' ? ('warning' as const) : ('default' as const);
    })();
    const isDream = mark.kind === 'nightly' && base !== 'danger' && base !== 'warning';
    return { color: isDream ? 'default' : base, isDream };
}
