import type { createClient } from './server.ts';

export async function createProjectWithAgents(
    client: ReturnType<typeof createClient>,
    input: { agentIds: readonly string[]; name: string; serverId: string }
) {
    const { chat } = await client.project.create.mutate({
        name: input.name,
        serverId: input.serverId,
    });
    for (const agentId of input.agentIds) {
        await client.agent.setHome.mutate({
            agentId,
            projectId: chat.id,
            serverId: input.serverId,
        });
    }
    return chat;
}
