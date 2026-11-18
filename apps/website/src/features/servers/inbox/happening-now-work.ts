import type {
    ActiveCloudAgentWork,
    ActiveCloudAgentWorkLocation,
    Agent,
    CloudAgentJobState,
    CloudAgentProvider,
} from '@haus/api';
import { cloudAgentWorkText, elapsedSince } from '../../cloud-agents/cloud-agent-presentation.ts';
import { conversationLabel } from '../conversation-label.ts';
import type { HumanDirectory } from '../human-identity.ts';

/** One queued or running Cloud Agent work as the Inbox reads it. */
export interface HappeningNowWork {
    agentName: string;
    chatLabel: string;
    /** The work id, which is also the `?work=` deep link. */
    id: string;
    /** Where opening the row goes: the linking Message. */
    location: ActiveCloudAgentWorkLocation;
    provider: CloudAgentProvider;
    state: CloudAgentJobState;
    statusText: string;
    /** The Task the work is attached to, which opening the row goes to instead. */
    task: { id: string; key: string } | null;
    title: string;
}

/**
 * The Server already returns only work the viewer can see, oldest first, so
 * nothing is filtered here. Names resolve the way every Inbox row does: the
 * live Agent list and the shared human directory, with the Server's stored
 * Agent name standing in for a retired Agent.
 */
export function toHappeningNowWork(
    items: readonly ActiveCloudAgentWork[],
    humans: HumanDirectory,
    agents: readonly Agent[] = [],
    now: number = Date.now()
): HappeningNowWork[] {
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));

    return items.map((item) => ({
        agentName: workAgentName(item, agentsById),
        chatLabel: conversationLabel(item, humans),
        id: item.work.id,
        location: item.location,
        provider: item.work.provider,
        ...liveStatus(item.work, now),
        task: workTask(item),
        title: item.work.title,
    }));
}

/** The Server sends a Task's id and key together, or neither. */
function workTask({ taskId, taskKey }: ActiveCloudAgentWork): HappeningNowWork['task'] {
    return taskId !== null && taskKey !== null ? { id: taskId, key: taskKey } : null;
}

/** "Running · SEC-12 · #product · Forge": the Task key leads where there is one. */
export function happeningNowWorkSubline(work: HappeningNowWork): string {
    const facts = [work.statusText, work.task?.key, work.chatLabel, work.agentName];
    return facts.filter((fact) => fact !== undefined).join(' · ');
}

/**
 * This list is what is running now, so a job listed only because a follow-up
 * is live reads as that follow-up, not as the settled job behind it.
 */
function liveStatus(
    work: ActiveCloudAgentWork['work'],
    now: number
): Pick<HappeningNowWork, 'state' | 'statusText'> {
    const { job } = work;
    if (job.state === 'working' || !job.followUp) {
        return { state: job.state, statusText: cloudAgentWorkText(work, now) };
    }
    const elapsed = elapsedSince(job.followUp.since, now);
    const label = `Follow-up ${job.followUp.state}`;
    return { state: 'working', statusText: elapsed === null ? label : `${label} · ${elapsed}` };
}

function workAgentName(item: ActiveCloudAgentWork, agentsById: ReadonlyMap<string, Agent>): string {
    return agentsById.get(item.work.agentId)?.displayName ?? item.agentName;
}
