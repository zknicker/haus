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

type CreateAgentRequest = Parameters<
    ReturnType<typeof createClient>['agent']['create']['mutate']
>[0];

const captainsProject = { key: 'CAP', name: 'captains' };

export async function createHomedAgent(
    client: ReturnType<typeof createClient>,
    input: Omit<CreateAgentRequest, 'homeProjectId'>
) {
    const projects = await client.project.list.query({ serverId: input.serverId });
    const homeProjectId =
        projects.find((project) => project.name === captainsProject.name)?.chatId ??
        (await client.project.create.mutate({ ...captainsProject, serverId: input.serverId })).chat
            .id;
    return await client.agent.create.mutate({ ...input, homeProjectId });
}
