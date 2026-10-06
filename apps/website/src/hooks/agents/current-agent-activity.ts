import type {
    Agent,
    AgentActivityEvent,
    AgentCurrentActivity,
    AgentLifecycleEvent,
} from '@haus/api';
import {
    AGENT_ACTIVE_DELEGATIONS_MAX,
    isAgentCurrentActivityTerminalEvent,
    isAgentFinishingActivityEvent,
    projectAgentCurrentActivity,
} from '@haus/api/agent-activity';

export type CurrentAgentActivity = AgentCurrentActivity;

const activityLabels: Record<AgentActivityEvent['category'], string> = {
    browsing: 'Browsing…',
    checking_messages: 'Checking messages…',
    delegating: 'Running a sub-agent…',
    editing_files: 'Editing files…',
    reading_files: 'Reading files…',
    received_message: 'Received a new message…',
    running_command: 'Running a command…',
    searching_web: 'Searching the web…',
    sending_message: 'Sending a message…',
    starting_work: 'Starting work…',
    thinking: 'Thinking…',
    updating_instructions: 'Updating instructions…',
    using_tool: 'Using a tool…',
    working: 'Working…',
};

export function formatCurrentAgentActivityLabel(activity: AgentActivityEvent) {
    if (isAgentFinishingActivityEvent(activity)) {
        return 'Finishing up…';
    }
    if (activity.category === 'using_tool' && activity.toolRef) {
        return `Using ${activity.toolRef}…`;
    }
    return activityLabels[activity.category];
}

/**
 * Reconciles one committed activity event into the current-run snapshot.
 * Array position is the run's stable presentation order; category changes only
 * replace the existing row, while terminal events remove it.
 */
export function applyCurrentAgentActivityEvent(
    activities: readonly CurrentAgentActivity[],
    event: AgentActivityEvent
): CurrentAgentActivity[] {
    const index = activities.findIndex((activity) => activityKey(activity) === activityKey(event));
    const current = index >= 0 ? activities[index] : undefined;

    if (current && event.position <= current.position) {
        return [...activities];
    }
    // Lifecycle settlement owns row removal alongside Agent availability. Keep
    // the last semantic state until that event turns the Agent non-working.
    if (current && isAgentCurrentActivityTerminalEvent(event)) {
        return [...activities];
    }

    const projected = projectAgentCurrentActivity(current ?? null, event);
    if (!projected) {
        return index < 0
            ? [...activities]
            : activities.filter((_, itemIndex) => itemIndex !== index);
    }

    if (index < 0) {
        return [
            ...activities.filter((activity) => activity.agentId !== projected.agentId),
            projected,
        ];
    }

    return activities.map((activity, itemIndex) => (itemIndex === index ? projected : activity));
}

/**
 * Current activity is an accepted-run projection, not the durable journal.
 * Semantic completion means the Agent is between operations; only the
 * Server-owned working completion is authoritative turn settlement.
 */
export function projectCurrentAgentActivitySnapshot(
    activities: readonly CurrentAgentActivity[]
): CurrentAgentActivity[] {
    return activities.filter(
        (activity) => activity.phase === 'started' || isAgentFinishingActivityEvent(activity)
    );
}

export function reconcileCurrentAgentActivity(
    snapshot: readonly CurrentAgentActivity[],
    overlays: readonly CurrentAgentActivityLiveOverlay[]
) {
    const projected = projectCurrentAgentActivitySnapshot(snapshot);
    return overlays.reduce(
        (activities, overlay) =>
            applyCurrentAgentActivityEvent(
                activities,
                withSnapshotDelegations(activities, overlay)
            ),
        projected
    );
}

/**
 * Compacts the live overlay to one event per Agent without losing event ordering.
 * The overlay may begin mid-run, after the snapshot listed sub-agents it never
 * saw start, so it remembers which sub-agents it saw settle for that run.
 */
export interface CurrentAgentActivityLiveOverlay {
    event: CurrentAgentActivity;
    latestPosition: number;
    settledOperationIds: readonly string[];
}

export function mergeCurrentAgentActivityLiveEvent(
    previous: CurrentAgentActivityLiveOverlay | undefined,
    event: AgentActivityEvent
): CurrentAgentActivityLiveOverlay {
    const sameRun = previous?.event.runId === event.runId;
    if (previous && sameRun && previous.latestPosition >= event.position) {
        return previous;
    }
    const settledOperationIds = settledDelegations(
        sameRun ? (previous?.settledOperationIds ?? []) : [],
        event
    );
    const next = (current: Omit<CurrentAgentActivityLiveOverlay, 'settledOperationIds'>) => ({
        ...current,
        settledOperationIds,
    });
    if (previous && sameRun && isAgentCurrentActivityTerminalEvent(event)) {
        return next({ event: previous.event, latestPosition: event.position });
    }
    if (
        previous &&
        sameRun &&
        isAgentFinishingActivityEvent(previous.event) &&
        event.phase !== 'started'
    ) {
        return next({ event: previous.event, latestPosition: event.position });
    }
    if (
        previous &&
        sameRun &&
        (previous.event.phase === 'started' || isAgentFinishingActivityEvent(previous.event))
    ) {
        const projected = projectAgentCurrentActivity(previous.event, event);
        return next({
            event: projected ?? { ...event, runStartedAt: previous.event.runStartedAt },
            latestPosition: event.position,
        });
    }
    return next({
        event: projectAgentCurrentActivity(null, event) ?? { ...event, runStartedAt: null },
        latestPosition: event.position,
    });
}

/** Semantic activity describes only Agents whose canonical availability is working. */
export function filterCurrentAgentActivityByAvailability(
    activities: readonly CurrentAgentActivity[],
    agents: readonly Pick<Agent, 'availability' | 'id'>[]
) {
    const workingAgentIds = new Set(
        agents.filter((agent) => agent.availability === 'working').map((agent) => agent.id)
    );
    return activities.filter((activity) => workingAgentIds.has(activity.agentId));
}

/** Never carry one run's semantic presentation into a newer active lifecycle. */
export function filterCurrentAgentActivityByLifecycle(
    activities: readonly CurrentAgentActivity[],
    lifecycles: ReadonlyMap<string, AgentLifecycleEvent>
) {
    return activities.filter((activity) => {
        const lifecycle = lifecycles.get(activity.agentId);
        return !lifecycle || lifecycle.phase === 'settled' || lifecycle.runId === activity.runId;
    });
}

/**
 * Carries the snapshot's running sub-agents into an overlay of the same run,
 * minus those the overlay saw settle, so a mid-run reload keeps its count.
 */
function withSnapshotDelegations(
    activities: readonly CurrentAgentActivity[],
    overlay: CurrentAgentActivityLiveOverlay
): CurrentAgentActivity {
    const { event } = overlay;
    const snapshot = activities.find((activity) => activityKey(activity) === activityKey(event));
    const inherited = (snapshot?.activeDelegations ?? []).filter(
        (delegation) =>
            !(
                overlay.settledOperationIds.includes(delegation.operationId) ||
                event.activeDelegations?.some((own) => own.operationId === delegation.operationId)
            )
    );
    if (inherited.length === 0) {
        return event;
    }
    const activeDelegations = [...inherited, ...(event.activeDelegations ?? [])].slice(
        0,
        AGENT_ACTIVE_DELEGATIONS_MAX
    );
    const category =
        event.category === 'working' && event.phase === 'started' ? 'delegating' : event.category;
    return { ...event, activeDelegations, category };
}

function settledDelegations(settled: readonly string[], event: AgentActivityEvent) {
    if (event.category !== 'delegating' || event.phase === 'started' || !event.operationId) {
        return settled;
    }
    return settled.includes(event.operationId) ? settled : [...settled, event.operationId];
}

function activityKey(activity: AgentActivityEvent) {
    return `${activity.agentId}:${activity.runId}`;
}
