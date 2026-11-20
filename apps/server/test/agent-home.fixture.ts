import type { HausClient } from './haus-client.ts';

type CreateAgentRequest = Parameters<HausClient['trpc']['agent']['create']['mutate']>[0];

const captainsProject = { key: 'CAP', name: 'captains' };

export async function createHomedAgent(
    client: HausClient,
    input: Omit<CreateAgentRequest, 'homeProjectId'> & { homeProjectId?: string }
) {
    const homeProjectId =
        input.homeProjectId ?? (await ensureCaptainsProject(client, input.serverId));
    return await client.trpc.agent.create.mutate({ ...input, homeProjectId });
}

export async function ensureCaptainsProject(client: HausClient, serverId: string) {
    const projects = await client.trpc.project.list.query({ serverId });
    const existing = projects.find((project) => project.name === captainsProject.name);
    if (existing) {
        return existing.chatId;
    }
    return (await client.trpc.project.create.mutate({ ...captainsProject, serverId })).chat.id;
}
