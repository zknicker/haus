import type { AgentAddChannelAgentInput, AgentAddChannelAgentReceipt } from '@haus/api';
import {
    findActiveAgentByHandle,
    findLiveChannel,
    joinChannelAgents,
} from '../chats/channel-agent-membership.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { AgentIdentityProtectedError } from '../server-agents/errors.ts';
import { AgentTargetError } from './resolve-target.ts';

/**
 * `haus channel add`: one Agent puts another in a channel. Membership is a
 * correction any teammate may make, so the runner credential is the whole
 * authority; the add wakes nobody and repeating it changes nothing. Cove's
 * membership belongs to the onboarding factory, so it is refused here.
 */
export async function addAgentToChannel(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentAddChannelAgentInput
): Promise<AgentAddChannelAgentReceipt> {
    const channel = await findLiveChannel(db, runner.serverId, input.target);
    if (!channel) {
        throw new AgentTargetError(`There is no open channel "${input.target}" on this Server.`);
    }
    const handle = input.agent.startsWith('@') ? input.agent.slice(1) : input.agent;
    const agent = await findActiveAgentByHandle(db, runner.serverId, handle);
    if (!agent) {
        throw new AgentTargetError(`No active Agent on this Server answers to "@${handle}".`);
    }
    if (agent.factoryKind === 'cove') {
        throw new AgentIdentityProtectedError('Cove’s channel membership is product-owned.');
    }
    const joined = await joinChannelAgents(db, {
        agentIds: [agent.id],
        chatId: channel.id,
        serverId: runner.serverId,
    });
    return {
        added: joined.length > 0,
        handle: agent.handle,
        target: `#${channel.name}`,
    };
}
