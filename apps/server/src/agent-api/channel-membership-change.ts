import { and, eq } from 'drizzle-orm';
import { joinChannelAgents } from '../chats/channel-agent-membership.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { channelAgentParticipantsTable } from '../postgres/schema.ts';
import { findChannel } from './find-channel.ts';
import { AgentTargetError } from './resolve-target.ts';

export async function changeAgentChannelMembership(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string,
    action: 'join' | 'leave'
) {
    const channel = await findChannel(db, runner.serverId, target);
    if (action === 'join') {
        await joinChannelAgents(db, {
            agentIds: [runner.agentId],
            chatId: channel.id,
            serverId: runner.serverId,
        });
        return { joined: true, target: `#${channel.name}` };
    }
    if (channel.isAll) {
        throw new AgentTargetError(
            'Every Agent hears #all, the team room, so you cannot leave it.'
        );
    }
    await db
        .delete(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, channel.id),
                eq(channelAgentParticipantsTable.agentId, runner.agentId)
            )
        );
    return { left: true, target: `#${channel.name}` };
}
