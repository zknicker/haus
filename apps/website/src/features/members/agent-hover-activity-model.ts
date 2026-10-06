import type { AgentActivityEvent, AgentCurrentActivity } from '@haus/api';
import { formatCurrentAgentActivityLabel } from '../../hooks/agents/current-agent-activity.ts';
import { formatShortTime } from '../../lib/format.ts';
import { formatAgentActivityEvent } from './agent-profile/agent-activity-model.ts';
import { formatTurnDuration } from './agent-profile/agent-turn-row-model.ts';

/** A hover line: words on the left, a length in the right-aligned numeric column. */
export interface HoverTimedLine {
    readonly elapsed: string | null;
    readonly label: string;
}

/** What the Agent is doing now, on the turn's clock: `Running a command` · `42s`. */
export function formatHoverLiveLine(activity: AgentCurrentActivity, now: number): HoverTimedLine {
    const label = formatCurrentAgentActivityLabel(activity).replace(/…$/u, '');
    const started = activity.runStartedAt ? Date.parse(activity.runStartedAt) : Number.NaN;
    return { elapsed: formatElapsedSince(started, now), label };
}

/** The shared turn-length format since an epoch-ms start, or null when it is unknown. */
export function formatElapsedSince(startedMs: number, now: number): string | null {
    return Number.isNaN(startedMs) ? null : formatTurnDuration(now - startedMs);
}

export interface HoverLogLine {
    readonly id: string;
    readonly label: string;
    readonly occurredAt: string;
    /** Null when the line above already says the same time. */
    readonly time: string | null;
}

/** Bookkeeping categories the live line and turn rows already say. */
const unloggedCategories = new Set<AgentActivityEvent['category']>(['starting_work', 'working']);

/**
 * The current run's log, newest first. A settled step reads in past tense; a
 * start reads in present tense only while it is still running, so a run of
 * stale `…ing` lines never piles up beside the completions that ended them.
 * The step the live line already names is left out.
 */
export function selectHoverLogLines(
    events: readonly AgentActivityEvent[],
    current: Pick<AgentActivityEvent, 'id' | 'runId'>,
    limit = 3
): HoverLogLine[] {
    const run = events.filter(
        (event) => event.runId === current.runId && !unloggedCategories.has(event.category)
    );
    const lines: HoverLogLine[] = [];
    let previousTime: string | null = null;
    for (const [index, event] of run.entries()) {
        if (
            event.phase === 'started' &&
            (event.id === current.id || isSettled(event, run.slice(0, index)))
        ) {
            continue;
        }
        const time = formatShortTime(event.occurredAt);
        lines.push({
            id: event.id,
            label: formatAgentActivityEvent(event),
            occurredAt: event.occurredAt,
            time: time === previousTime ? null : time,
        });
        previousTime = time;
        if (lines.length === limit) {
            break;
        }
    }
    return lines;
}

/**
 * Sub-agents run side by side, so one settles only by its own operation id.
 * Any other step is over once the Agent does anything else.
 */
function isSettled(started: AgentActivityEvent, newer: readonly AgentActivityEvent[]): boolean {
    if (started.operationId) {
        return newer.some(
            (event) => event.operationId === started.operationId && event.phase !== 'started'
        );
    }
    return newer.some((event) => event.category !== 'received_message');
}
