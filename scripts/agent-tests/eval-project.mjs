export async function createEvalProject(harness, { agentIds, name }) {
    const { chat } = await harness.trpc('project.create', { name, serverId: harness.serverId });
    for (const agentId of agentIds) {
        await harness.trpc('agent.setHome', {
            agentId,
            projectId: chat.id,
            serverId: harness.serverId,
        });
    }
    return chat;
}
