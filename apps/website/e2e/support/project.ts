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
