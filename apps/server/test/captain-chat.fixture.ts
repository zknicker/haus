import type { HausClient } from './haus-client.ts';

export async function openCaptainChat(
    client: Pick<HausClient, 'trpc'>,
    input: { agentId: string; serverId: string }
) {
    const chats = await client.trpc.chat.list.query({ serverId: input.serverId });
    const chat = chats.find(
        (candidate) => candidate.kind === 'captain' && candidate.peerAgentId === input.agentId
    );
    if (!chat) {
        throw new Error(`Agent ${input.agentId} has no Captain chat.`);
    }
    return chat;
}
