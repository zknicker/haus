import type { Agent, AgentLifecycleEvent } from '@haus/api';
import {
    type CurrentAgentActivity,
    filterCurrentAgentActivityByLifecycle,
    formatCurrentAgentActivityLabel,
} from '../../../hooks/agents/current-agent-activity.ts';

/** One Agent in a turn, as both the roster band and Happening now read it. */
export interface HappeningNowAgent {
    agent: Agent | null;
    id: string;
    /** Current activity alongside elapsed time for the whole turn. */
    label: string;
    name: string;
    /**
     * The current step alone, without the elapsed clause: what the row's
     * accessible name says, so the name changes when the step does rather
     * than every second.
     */
    step: string;
}

/**
 * The Agent's current step by id, for a surface that already has its own row
 * for that Agent. Lifecycle filtering happens here so no caller can forget it:
 * a settled run's last step must never be painted onto a newer one.
 */
export function currentAgentActivityLabels(
    activities: readonly CurrentAgentActivity[],
    lifecycles: ReadonlyMap<string, AgentLifecycleEvent>
): ReadonlyMap<string, string> {
    return new Map(
        filterCurrentAgentActivityByLifecycle(activities, lifecycles).map((activity) => [
            activity.agentId,
            formatCurrentAgentActivityLabel(activity),
        ])
    );
}

/** Current steps share a continuous clock anchored to the Server's turn start. */
export function happeningNowAgentRows(
    activities: readonly CurrentAgentActivity[],
    lifecycles: ReadonlyMap<string, AgentLifecycleEvent>,
    agents: readonly Agent[],
    now: number
): HappeningNowAgent[] {
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    return filterCurrentAgentActivityByLifecycle(activities, lifecycles).map((activity) => {
        const agent = agentById.get(activity.agentId) ?? null;
        const step = formatCurrentAgentActivityLabel(activity);
        return {
            agent,
            id: activity.agentId,
            label: stepWithElapsed(step, activity.runStartedAt, now),
            name: agent?.displayName ?? `Agent ${activity.agentId.slice(-6)}`,
            step: withoutEllipsis(step),
        };
    });
}

/**
 * The step label carries a trailing ellipsis to say "still going". Once an
 * elapsed clause follows it, the clause says that instead, so the ellipsis
 * comes off rather than reading as `Editing files… · 3m`.
 */
function stepWithElapsed(label: string, runStartedAt: string | null, now: number): string {
    if (runStartedAt === null) {
        return label;
    }
    const seconds = Math.max(0, Math.floor((now - Date.parse(runStartedAt)) / 1000));
    const minutes = Math.floor(seconds / 60);
    const elapsed = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
    return `${withoutEllipsis(label)} · ${elapsed} elapsed`;
}

function withoutEllipsis(label: string): string {
    return label.replace(/…$/u, '');
}
