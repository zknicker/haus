import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import { readDayBounds } from './heartbeats-model.ts';

/**
 * The feed's pure model. A report or a dream is a post made of thoughts, one
 * bubble each; a failed or yielded run is a system note, never a bubble. Quiet
 * check-ins, skips and pauses take no row. Days run newest first, and so do the
 * entries within a day.
 */
export interface FeedPost {
    readonly agentId: string;
    readonly key: string;
    readonly kind: 'post';
    readonly mark: HeartbeatMark;
    readonly postKind: 'dreamed' | 'noticed';
    /** One per bubble. */
    readonly thoughts: readonly string[];
}

export interface FeedNote {
    readonly agentId: string;
    readonly key: string;
    readonly kind: 'note';
    readonly mark: HeartbeatMark;
    /** `dreamed` is a dream with nothing learned to say. */
    readonly reason: 'dreamed' | 'failed' | 'yielded';
}

export type FeedEntry = FeedNote | FeedPost;

/** One local day's entries; `startMs` keys the day and labels its divider. */
export interface FeedDay {
    readonly entries: readonly FeedEntry[];
    readonly startMs: number;
}

/** The entry a mark makes, or null when it is not worth a row. */
export function readFeedEntry(agentId: string, mark: HeartbeatMark): FeedEntry | null {
    if (mark.runId === null) {
        return null;
    }
    const key = `${agentId}:${mark.runId}`;
    if (mark.outcome === 'failed' || mark.outcome === 'yielded') {
        return { agentId, key, kind: 'note', mark, reason: mark.outcome };
    }
    if (mark.kind === 'nightly') {
        if (mark.dream === null && mark.outcome !== 'quiet') {
            return null;
        }
        const thoughts = readDreamThoughts(mark.dream?.summary ?? null);
        if (thoughts.length === 0) {
            return { agentId, key, kind: 'note', mark, reason: 'dreamed' };
        }
        return { agentId, key, kind: 'post', mark, postKind: 'dreamed', thoughts };
    }
    if (mark.outcome === 'reported' && mark.report !== null) {
        const thoughts = readReportThoughts(mark.report.text);
        return { agentId, key, kind: 'post', mark, postKind: 'noticed', thoughts };
    }
    return null;
}

/**
 * Days of entries across the lanes, newest first. `agentIds` narrows the feed;
 * empty is every Agent.
 */
export function readFeedDays(
    lanes: readonly HeartbeatLane[],
    agentIds: readonly string[]
): FeedDay[] {
    const days = new Map<number, FeedEntry[]>();
    for (const lane of lanes) {
        if (agentIds.length > 0 && !agentIds.includes(lane.agentId)) {
            continue;
        }
        for (const mark of lane.marks) {
            const entry = readFeedEntry(lane.agentId, mark);
            if (entry) {
                const { startMs } = readDayBounds(Date.parse(mark.at));
                days.set(startMs, [...(days.get(startMs) ?? []), entry]);
            }
        }
    }
    return [...days]
        .sort(([left], [right]) => right - left)
        .map(([startMs, entries]) => ({
            entries: entries.sort((left, right) => right.mark.at.localeCompare(left.mark.at)),
            startMs,
        }));
}

/** A dream summary's "what I learned" lines, bullets stripped: a thought each. */
export function readDreamThoughts(summary: string | null): string[] {
    return (summary ?? '')
        .split('\n')
        .map((line) => stripBullet(line.trim()))
        .filter((line) => line !== '');
}

/**
 * A report's thoughts: each bullet is one, and consecutive prose lines join
 * into a paragraph that is one, split at blank lines.
 */
export function readReportThoughts(text: string): string[] {
    const thoughts: string[] = [];
    let paragraph: string[] = [];
    const flush = () => {
        if (paragraph.length > 0) {
            thoughts.push(paragraph.join(' '));
            paragraph = [];
        }
    };
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line === '') {
            flush();
        } else if (bulletPattern.test(line)) {
            flush();
            thoughts.push(stripBullet(line));
        } else {
            paragraph.push(line);
        }
    }
    flush();
    return thoughts;
}

const bulletPattern = /^(?:[-*•]|\d+[.)])\s+/u;

function stripBullet(line: string): string {
    return line.replace(bulletPattern, '');
}

export function readFollowUpCount(count: number): string | null {
    if (count === 0) {
        return null;
    }
    return count === 1 ? '1 follow-up' : `${count} follow-ups`;
}
