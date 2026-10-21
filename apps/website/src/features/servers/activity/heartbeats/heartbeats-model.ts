import type {
    AgentHeartbeats,
    HeartbeatLane,
    HeartbeatMark,
    HeartbeatPlanShare,
    HeartbeatSkipReason,
} from '@haus/api';

/**
 * The Heartbeats view's pure model: where a mark sits on the day's track, the
 * night bands and hour ticks behind it, the words for each outcome, the
 * summary strip's facts, a plan meter's segments, and which mark is selected.
 */
export type HeartbeatOutcome = HeartbeatMark['outcome'];

/** The viewer's local day: its bounds as the Server read wants them, and as numbers. */
export interface DayWindow {
    readonly endMs: number;
    readonly from: string;
    readonly startMs: number;
    readonly to: string;
}

export interface TrackBand {
    readonly left: number;
    readonly width: number;
}

export interface TrackTick {
    readonly at: number;
    /** Set on the ticks that carry a label (every sixth hour). */
    readonly label: string | null;
}

/** The local day `offsetDays` before today's; 0 is today. */
export function readDayWindow(offsetDays: number, now: number): DayWindow {
    const today = new Date(now);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetDays);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return {
        endMs: end.getTime(),
        from: start.toISOString(),
        startMs: start.getTime(),
        to: end.toISOString(),
    };
}

/** A time's place on the day's track, in percent, held inside the track. */
export function readTrackPosition(atMs: number, window: DayWindow): number {
    const span = window.endMs - window.startMs;
    if (span <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, ((atMs - window.startMs) / span) * 100));
}

/** Night is 22:00 to 08:00 on the viewer's clock: a band at each end of the track. */
export function readNightBands(window: DayWindow): TrackBand[] {
    const start = new Date(window.startMs);
    const at = (hour: number) =>
        readTrackPosition(
            new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour).getTime(),
            window
        );
    const morning = at(8);
    const evening = at(22);
    return [
        { left: 0, width: morning },
        { left: evening, width: 100 - evening },
    ];
}

const tickLabels: Record<number, string> = { 0: '12a', 12: '12p', 18: '6p', 6: '6a' };

/** An hour tick across the day, the sixth hours labeled. */
export function readHourTicks(window: DayWindow): TrackTick[] {
    const start = new Date(window.startMs);
    return Array.from({ length: 24 }, (_, hour) => ({
        at: readTrackPosition(
            new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour).getTime(),
            window
        ),
        label: tickLabels[hour] ?? null,
    }));
}

export function readMarkKey(agentId: string, mark: HeartbeatMark): string {
    return `${agentId}:${mark.kind}:${mark.at}`;
}

export const outcomeLabels: Record<HeartbeatOutcome, string> = {
    failed: 'Failed',
    paused: 'Paused',
    quiet: 'Quiet',
    reported: 'Reported',
    running: 'Running',
    skipped: 'Skipped',
    yielded: 'Yielded',
};

export function readKindLabel(mark: Pick<HeartbeatMark, 'kind'>): string {
    return mark.kind === 'nightly' ? 'Dream' : 'Heartbeat';
}

const skipReasonLabels: Record<HeartbeatSkipReason, string> = {
    busy: 'The Agent was busy with other work',
    'no-activity': 'Nothing had changed since the last check-in',
    'not-configured': 'Heartbeat is not set up for this Agent',
    'plan-limit': 'Paused at 80% of the weekly plan meter',
    stopped: 'The Agent was stopped',
};

/** What became of the mark, in a line: where its report went, or why nothing ran. */
export function readMarkFate(mark: HeartbeatMark, chatPlace: string | null): string {
    switch (mark.outcome) {
        case 'reported':
            return mark.report?.postedChatId
                ? `Posted in ${chatPlace ?? 'a chat'}`
                : 'Read by the Agent, nothing posted';
        case 'quiet':
            return 'Nothing to report';
        case 'yielded':
            return 'Stopped early for a message addressed to the Agent';
        case 'failed':
            return 'Ended with an error';
        case 'running':
            return 'Still running';
        default:
            return mark.skipReason
                ? skipReasonLabels[mark.skipReason]
                : outcomeLabels[mark.outcome];
    }
}

export function formatTokens(tokens: number | null): string | null {
    if (tokens === null) {
        return null;
    }
    if (tokens < 1000) {
        return String(tokens);
    }
    if (tokens < 1_000_000) {
        const thousands = tokens / 1000;
        return `${thousands < 100 ? thousands.toFixed(1) : Math.round(thousands)}k`;
    }
    return `${(tokens / 1_000_000).toFixed(1)}M`;
}

export function formatDreamDelta(
    dream: Pick<NonNullable<HeartbeatMark['dream']>, 'added' | 'removed'>
) {
    return `+${dream.added} −${dream.removed}`;
}

export interface SummaryFacts {
    /** Runs, then what they did. */
    readonly outcomes: readonly string[];
    /** What came of them. */
    readonly results: readonly string[];
}

export function readSummaryFacts(summary: AgentHeartbeats['summary']): SummaryFacts {
    return {
        outcomes: [
            count(summary.runs, 'heartbeat', 'heartbeats'),
            `${summary.reported} reported`,
            `${summary.yielded} yielded`,
            `${summary.skipped} skipped`,
            ...(summary.paused > 0 ? [`${summary.paused} paused`] : []),
        ],
        results: [
            count(summary.posts, 'post', 'posts'),
            count(summary.rulesLearned, 'rule learned', 'rules learned'),
            count(summary.followUps, 'follow-up', 'follow-ups'),
        ],
    };
}

export interface PlanMeter {
    readonly dream: number;
    readonly heartbeat: number;
    readonly label: string;
    /** Used by everything else on the plan. */
    readonly other: number;
    readonly tooltip: string;
    readonly used: number;
}

/** A plan's weekly meter as segments of one bar: other use, heartbeats, dreams. */
export function readPlanMeter(plan: HeartbeatPlanShare): PlanMeter {
    const used = Math.min(100, plan.usedPercent);
    const heartbeat = Math.min(plan.heartbeatPercent, used);
    const dream = Math.min(plan.dreamPercent, used - heartbeat);
    return {
        dream,
        heartbeat,
        label: plan.label,
        other: used - heartbeat - dream,
        tooltip: `~${formatPercent(plan.heartbeatPercent)} heartbeats and ~${formatPercent(plan.dreamPercent)} dreams of ${plan.label}'s weekly meter. An estimate: the plan's reported use, split by token share.`,
        used,
    };
}

export function formatPercent(percent: number): string {
    return percent < 10 && !Number.isInteger(percent)
        ? `${percent.toFixed(1)}%`
        : `${Math.round(percent)}%`;
}

export interface LaneView {
    readonly agentId: string;
    readonly lane: HeartbeatLane;
}

/**
 * One lane per visible Agent, in the Agents' own order. An Agent with nothing
 * on the day still gets its (empty) lane, so an idle or paused Agent shows;
 * lanes of unknown Agents drop.
 */
export function readLanes(
    lanes: readonly HeartbeatLane[],
    agentOrder: readonly string[]
): LaneView[] {
    return agentOrder.map((agentId) => ({
        agentId,
        lane: lanes.find((candidate) => candidate.agentId === agentId) ?? {
            agentId,
            marks: [],
            tokens: 0,
        },
    }));
}

export interface SelectedMark {
    readonly agentId: string;
    readonly key: string;
    readonly mark: HeartbeatMark;
}

/** The chosen mark when it is still on the day; otherwise the newest reported, else the newest. */
export function resolveSelection(
    lanes: readonly LaneView[],
    chosenKey: string | null
): SelectedMark | null {
    const all = lanes.flatMap(({ agentId, lane }) =>
        lane.marks.map((mark) => ({ agentId, key: readMarkKey(agentId, mark), mark }))
    );
    const chosen = chosenKey ? all.find((entry) => entry.key === chosenKey) : undefined;
    if (chosen) {
        return chosen;
    }
    const newestFirst = [...all].sort(
        (left, right) => Date.parse(right.mark.at) - Date.parse(left.mark.at)
    );
    return newestFirst.find((entry) => entry.mark.outcome === 'reported') ?? newestFirst[0] ?? null;
}

function count(value: number, one: string, many: string): string {
    return `${value} ${value === 1 ? one : many}`;
}
