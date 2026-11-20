import { createAgentAuthor } from './author.mjs';

export async function createEvalProject(harness, { agentIds, name, repositoryRoot }) {
    const { chat } = await harness.trpc('project.create', { name, serverId: harness.serverId });
    const { mint } = createAgentAuthor({
        repositoryRoot,
        serverId: harness.serverId,
        serverUrl: harness.serverUrl,
        stamp: harness.stamp,
    });
    for (const agentId of agentIds) {
        const response = await fetch(`${harness.serverUrl}/api/agent/channels/join`, {
            body: JSON.stringify({ target: `#${chat.name}` }),
            headers: {
                authorization: `Bearer ${await mint(agentId, chat.id)}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(
                `Agent ${agentId} could not join #${chat.name} (${response.status}): ${await response.text()}`
            );
        }
    }
    return chat;
}
