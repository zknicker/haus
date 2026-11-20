import { type createClient, runPsql } from './server.ts';

export async function createProjectWithAgents(
    client: ReturnType<typeof createClient>,
    input: { agentIds: readonly string[]; databaseUrl: string; name: string; serverId: string }
) {
    const { chat } = await client.project.create.mutate({
        name: input.name,
        serverId: input.serverId,
    });
    for (const agentId of input.agentIds) {
        runPsql(
            input.databaseUrl,
            `insert into channel_agent_participants (server_id, chat_id, agent_id)
             values ('${input.serverId}', '${chat.id}', '${agentId}')
             on conflict do nothing`
        );
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
    const homeProjectId = await captainsProjectId(client, input.serverId);
    return await client.agent.create.mutate({ ...input, homeProjectId });
}

export async function captainsProjectId(client: ReturnType<typeof createClient>, serverId: string) {
    const projects = await client.project.list.query({ serverId });
    return (
        projects.find((project) => project.name === captainsProject.name)?.chatId ??
        (await client.project.create.mutate({ ...captainsProject, serverId })).chat.id
    );
}
