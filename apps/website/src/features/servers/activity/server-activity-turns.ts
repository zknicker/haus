import type { AgentCurrentActivity, AgentTurn } from '@haus/api';
import type {
    ActivityLogAgent,
    ActivityLogAgentTurns,
} from '../../members/agent-profile/agent-activity-log-entries.ts';
import {
    type AgentActivityTurn,
    groupAgentActivityTurns,
} from '../../members/agent-profile/agent-activity-turns.ts';

/**
 * The Server Activity page's turns, per Agent: each Agent's settled turns
 * from `agent.serverTurns`, plus the run it is working on now from the
 * Server's current-activity projection. A run that already settled reads as
 * settled; turns of Agents no longer listed are dropped.
 */
export function readServerActivityGroups({
    agents,
    current,
    now = Date.now(),
    settled,
}: {
    agents: readonly ActivityLogAgent[];
    current: readonly AgentCurrentActivity[];
    now?: number;
    settled: readonly AgentTurn[];
}): ActivityLogAgentTurns[] {
    return agents.flatMap((agent) => {
        const agentSettled = settled.filter((turn) => turn.agentId === agent.id);
        const settledRuns = new Set(agentSettled.map((turn) => turn.runId));
        const running = current
            .filter((activity) => activity.agentId === agent.id)
            .filter((activity) => !settledRuns.has(activity.runId))
            .map((activity) => runningTurn(activity, now));
        const turns = [...running, ...groupAgentActivityTurns([], agentSettled, now)];
        return turns.length > 0 ? [{ agent, turns }] : [];
    });
}

/**
 * A working run from its current activity. Its step history stays with the
 * live journal (Owner/Admin); the log needs only when it started.
 */
function runningTurn(activity: AgentCurrentActivity, now: number): AgentActivityTurn {
    const startedAt = activity.runStartedAt ?? activity.occurredAt;
    return {
        durationMs: Math.max(0, now - Date.parse(startedAt)),
        events: [],
        kind: 'active',
        messageCount: 0,
        operationCount: 0,
        operations: [],
        runId: activity.runId,
        startedAt,
        trigger: null,
    };
}
