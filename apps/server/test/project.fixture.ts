import type { ProjectCreateInput } from '@haus/api';
import { joinChannelAgents } from '../src/chats/channel-agent-membership.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import type { HausClient } from './haus-client.ts';

export async function createTestProject(
    harness: { databaseUrl: string },
    owner: Pick<HausClient, 'trpc'>,
    { agentIds, ...input }: ProjectCreateInput & { agentIds: readonly string[] }
) {
    const { chat } = await owner.trpc.project.create.mutate(input);
    await joinAgents(harness, { agentIds, chatId: chat.id, serverId: input.serverId });
    return chat;
}

export async function joinAgents(
    harness: { databaseUrl: string },
    input: { agentIds: readonly string[]; chatId: string; serverId: string }
) {
    const connection = await connectHausDatabase(harness.databaseUrl);
    try {
        await joinChannelAgents(connection.db, { ...input, agentIds: [...input.agentIds] });
    } finally {
        await connection.close();
    }
}
