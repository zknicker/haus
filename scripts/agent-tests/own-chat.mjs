export async function readOwnChatId(harness, agent) {
    if ('captainChatId' in agent) {
        if (!agent.captainChatId) {
            throw new Error(`Agent @${agent.handle} has no Captain chat.`);
        }
        return agent.captainChatId;
    }
    const dm = await harness.trpc('chat.ensureAgentDm', {
        agentId: agent.id,
        serverId: harness.serverId,
    });
    return dm.id;
}
