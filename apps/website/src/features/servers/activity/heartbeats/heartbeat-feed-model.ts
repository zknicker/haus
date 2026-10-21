import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import { formatTurnDuration } from '../../../members/agent-profile/agent-turn-row-model.ts';
import { formatTokens } from './heartbeats-model.ts';

/**
 * The Heartbeats feed's pure model: which runs are posts, how consecutive quiet
 * runs fold into one line, and the words of a post's footer. The feed reads
 * newest first.
 */
export interface FeedPost {
    readonly agentId: string;
    readonly key: string;
    readonly kind: 'post';
    readonly mark: HeartbeatMark;
}

/** Consecutive quiet check-ins of one Agent, folded into a single line. */
export interface FeedQuietFold {
    readonly agentId: string;
    /** The newest quiet run's time: the fold's place in the feed. */
    readonly at: string;
    readonly key: string;
    readonly kind: 'quiet';
    /** Oldest first. */
    readonly marks: readonly HeartbeatMark[];
}

export type FeedItem = FeedPost | FeedQuietFold;

/** A reported, failed or yielded run, or a settled dream, is worth a post. */
export function isPost(mark: HeartbeatMark): boolean {
    if (mark.runId === null) {
        return false;
    }
    if (mark.outcome === 'failed' || mark.outcome === 'yielded') {
        return true;
    }
    if (mark.outcome === 'reported') {
        return mark.report !== null;
    }
    return mark.kind === 'nightly' && mark.outcome === 'quiet';
}

function isQuietCheckIn(mark: HeartbeatMark): boolean {
    return mark.kind === 'daytime' && mark.outcome === 'quiet';
}

/**
 * Posts and quiet folds across the lanes, newest first. Per Agent, quiet runs
 * with no post between them fold together; skipped, paused and running slots
 * neither post nor break a fold.
 */
export function readFeed(lanes: readonly HeartbeatLane[]): FeedItem[] {
    const items: FeedItem[] = [];
    for (const lane of lanes) {
        let fold: HeartbeatMark[] = [];
        const closeFold = () => {
            const newest = fold.at(-1);
            if (newest) {
                items.push({
                    agentId: lane.agentId,
                    at: newest.at,
                    key: `${lane.agentId}:quiet:${fold[0]?.at}`,
                    kind: 'quiet',
                    marks: fold,
                });
            }
            fold = [];
        };
        for (const mark of [...lane.marks].sort((a, b) => a.at.localeCompare(b.at))) {
            if (isPost(mark)) {
                closeFold();
                items.push({
                    agentId: lane.agentId,
                    key: `${lane.agentId}:${mark.runId}`,
                    kind: 'post',
                    mark,
                });
            } else if (isQuietCheckIn(mark)) {
                fold.push(mark);
            }
        }
        closeFold();
    }
    return items.sort((left, right) => readItemAt(right).localeCompare(readItemAt(left)));
}

export function readItemAt(item: FeedItem): string {
    return item.kind === 'post' ? item.mark.at : item.at;
}

/** "Blippy checked in 4× · nothing to report". */
export function readQuietFoldText(name: string, count: number): string {
    return `${name} checked in ${count === 1 ? 'once' : `${count}×`} · nothing to report`;
}

/** The "what I learned" lines of a dream summary, bullets stripped. */
export function readSummaryLines(summary: string | null): string[] {
    return (summary ?? '')
        .split('\n')
        .map((line) => line.trim().replace(/^[-*•]\s+/u, ''))
        .filter((line) => line !== '');
}

/** "41s · 18k tokens": a run's cost, for the quiet end of a post. */
export function readRunCost(mark: HeartbeatMark): string {
    const tokens = formatTokens(mark.tokens);
    return [
        mark.durationMs === null ? null : formatTurnDuration(mark.durationMs),
        tokens === null ? null : `${tokens} tokens`,
    ]
        .filter(Boolean)
        .join(' · ');
}

export function readKindLabel(mark: HeartbeatMark): string {
    return mark.kind === 'nightly' ? 'Dream' : 'Heartbeat';
}
