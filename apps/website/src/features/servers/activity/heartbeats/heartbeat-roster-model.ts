import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import { readDayBounds } from './heartbeats-model.ts';

/**
 * The roster's per-Agent signal: whether it has news, dreamed last night, or is
 * quiet, and whether a check-in runs now. The roster carries no status text.
 */
export type RosterSignal = 'dream' | 'new' | 'none';

export interface RosterEntry {
    readonly agentId: string;
    readonly isLive: boolean;
    readonly signal: RosterSignal;
}

/** A dream that began after this many hours before midnight counts as last night's. */
const lastNightHours = 6;
const hourMs = 60 * 60 * 1000;

export function readRoster(
    agentIds: readonly string[],
    lanes: readonly HeartbeatLane[],
    nowMs: number
): RosterEntry[] {
    const marksByAgent = new Map(lanes.map((lane) => [lane.agentId, lane.marks]));
    return agentIds.map((agentId) =>
        readRosterEntry(agentId, marksByAgent.get(agentId) ?? [], nowMs)
    );
}

function readRosterEntry(
    agentId: string,
    marks: readonly HeartbeatMark[],
    nowMs: number
): RosterEntry {
    const today = readDayBounds(nowMs);
    const noticed = marks.some((mark) => {
        const at = Date.parse(mark.at);
        return (
            mark.kind === 'daytime' &&
            mark.outcome === 'reported' &&
            mark.report !== null &&
            at >= today.startMs &&
            at < today.endMs
        );
    });
    const dreamed = marks.some(
        (mark) =>
            mark.kind === 'nightly' &&
            mark.dream !== null &&
            Date.parse(mark.at) >= today.startMs - lastNightHours * hourMs
    );
    const isLive = marks.some((mark) => mark.outcome === 'running');
    return { agentId, isLive, signal: noticed ? 'new' : dreamed ? 'dream' : 'none' };
}
