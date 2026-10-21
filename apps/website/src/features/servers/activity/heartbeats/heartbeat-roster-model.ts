import type { HeartbeatLane, HeartbeatMark, HeartbeatSkipReason } from '@haus/api';
import { formatShortTime } from '../../../../lib/format.ts';
import { readDayBounds } from './heartbeats-model.ts';

/**
 * The roster's per-Agent ring and one-line status: what each Agent is doing now
 * and whether it has news. Quiet check-ins live here and nowhere else.
 */
export type RosterRing = 'dream' | 'new' | 'quiet';

export interface RosterEntry {
    readonly agentId: string;
    readonly isLive: boolean;
    readonly ring: RosterRing;
    readonly status: string;
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
    const todays = marks.filter((mark) => {
        const at = Date.parse(mark.at);
        return at >= today.startMs && at < today.endMs;
    });
    const daytime = todays.filter((mark) => mark.kind === 'daytime');
    const noticed = daytime.filter((mark) => mark.outcome === 'reported' && mark.report !== null);
    const dreamed = marks.some(
        (mark) =>
            mark.kind === 'nightly' &&
            mark.dream !== null &&
            Date.parse(mark.at) >= today.startMs - lastNightHours * hourMs
    );
    const running = marks.find((mark) => mark.outcome === 'running');
    const latestDaytime = daytime.at(-1);
    const ring: RosterRing = noticed.length > 0 ? 'new' : dreamed ? 'dream' : 'quiet';

    let status: string;
    if (running) {
        status = running.kind === 'nightly' ? 'Dreaming…' : 'Checking in…';
    } else if (latestDaytime?.outcome === 'paused') {
        status = readPausedStatus(latestDaytime.skipReason);
    } else if (noticed.length > 0) {
        status = `${noticed.length} new · ${formatShortTime(noticed.at(-1)?.at)}`;
    } else if (dreamed) {
        status = 'Dreamed · quiet today';
    } else {
        status = readQuietStatus(daytime.filter((mark) => mark.runId !== null).length);
    }
    return { agentId, isLive: running !== undefined, ring, status };
}

function readQuietStatus(checkIns: number): string {
    if (checkIns === 0) {
        return 'No check-ins yet';
    }
    return `Quiet · ${checkIns === 1 ? '1 check-in' : `${checkIns} check-ins`}`;
}

const pausedReasons: Record<HeartbeatSkipReason, string> = {
    busy: 'busy',
    'no-activity': 'no activity',
    'not-configured': 'not set up',
    'plan-limit': 'plan limit',
    stopped: 'stopped',
};

function readPausedStatus(reason: HeartbeatSkipReason | null): string {
    return reason === null ? 'Paused' : `Paused · ${pausedReasons[reason]}`;
}
