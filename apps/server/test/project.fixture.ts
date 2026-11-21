import type { ProjectCreateInput } from '@haus/api';
import type { HausClient } from './haus-client.ts';

export async function createTestProject(
    owner: Pick<HausClient, 'trpc'>,
    {
        agentIds = [],
        homeAgentIds = [],
        ...input
    }: ProjectCreateInput & { agentIds?: readonly string[]; homeAgentIds?: readonly string[] }
) {
    const { chat } = await owner.trpc.project.create.mutate(input);
    for (const agentId of agentIds) {
        await owner.trpc.agent.setHome.mutate({
            agentId,
            projectId: chat.id,
            serverId: input.serverId,
        });
    }
    return chat;
}
