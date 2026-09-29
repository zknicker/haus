import type { ActiveCloudAgentWork, Agent, CloudAgentProvider } from '@haus/api';
import {
    type CloudAgentPresentationStatus,
    cloudAgentPresentationStatus,
    cloudAgentStatusText,
} from '../../cloud-agents/cloud-agent-presentation.ts';
import { conversationLabel } from '../conversation-label.ts';
import type { HumanDirectory } from '../human-identity.ts';

/** One queued or running Cloud Agent work as the Inbox reads it. */
export interface HappeningNowWork {
    agentName: string;
    chatLabel: string;
    /** The work Message id, which is also the `?work=` deep link. */
    id: string;
    provider: CloudAgentProvider;
    status: CloudAgentPresentationStatus;
    statusText: string;
    title: string;
}

/**
 * The Server already returns only work the viewer can see, oldest first, so
 * nothing is filtered here. Names resolve the same way the Needs you rows above do:
 * the live Agent list and the shared human directory, with the Message's
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
        status: cloudAgentPresentationStatus(item.work),
        statusText: cloudAgentStatusText(item.work, now),
        title: item.work.title,
    }));
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
