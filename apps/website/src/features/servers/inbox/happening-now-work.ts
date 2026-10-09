import type {
    ActiveCloudAgentWork,
    Agent,
    CloudAgentJobState,
    CloudAgentProvider,
} from '@haus/api';
import { cloudAgentJobText, elapsedSince } from '../../cloud-agents/cloud-agent-presentation.ts';
import { conversationLabel } from '../conversation-label.ts';
import type { HumanDirectory } from '../human-identity.ts';

/** One queued or running Cloud Agent work as the Inbox reads it. */
export interface HappeningNowWork {
    agentName: string;
    chatLabel: string;
    /** The work Message id, which is also the `?work=` deep link. */
    id: string;
    provider: CloudAgentProvider;
    state: CloudAgentJobState;
    statusText: string;
    title: string;
}

/**
 * The Server already returns only work the viewer can see, oldest first, so
 * nothing is filtered here. Names resolve the way every Inbox row does: the
 * live Agent list and the shared human directory, with the Message's
 * stored author profile standing in for a retired Agent.
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
        id: item.work.messageId,
        provider: item.work.provider,
        ...liveStatus(item.work.job, now),
        title: item.work.title,
    }));
}

/**
 * This list is what is running now, so a job listed only because a follow-up
 * is live reads as that follow-up, not as the settled job behind it.
 */
function liveStatus(
    job: ActiveCloudAgentWork['work']['job'],
    now: number
): Pick<HappeningNowWork, 'state' | 'statusText'> {
    if (job.state === 'working' || !job.followUp) {
        return { state: job.state, statusText: cloudAgentJobText(job, now) };
    }
    const elapsed = elapsedSince(job.followUp.since, now);
    const label = `Follow-up ${job.followUp.state}`;
    return { state: 'working', statusText: elapsed === null ? label : `${label} · ${elapsed}` };
}

function workAgentName(item: ActiveCloudAgentWork, agentsById: ReadonlyMap<string, Agent>): string {
    const agent = agentsById.get(item.work.agentId);
    if (agent) {
        return agent.displayName;
    }
    const author = item.message.author;
    if (author.kind === 'agent' && author.profile) {
        return author.profile.displayName;
    }
    return `Agent ${item.work.agentId.slice(-6)}`;
}
