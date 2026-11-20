import type { ProjectCreateInput } from '@haus/api';
import { inArray } from 'drizzle-orm';
import { joinChannelAgents } from '../src/chats/channel-agent-membership.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { agentsTable } from '../src/postgres/schema.ts';
import type { HausClient } from './haus-client.ts';

export async function createTestProject(
    harness: { databaseUrl: string },
    owner: Pick<HausClient, 'trpc'>,
    {
        agentIds = [],
        homeAgentIds = [],
        ...input
    }: ProjectCreateInput & { agentIds?: readonly string[]; homeAgentIds?: readonly string[] }
) {
    const { chat } = await owner.trpc.project.create.mutate(input);
    await joinAgents(harness, {
        agentIds: [...agentIds, ...homeAgentIds],
        chatId: chat.id,
        serverId: input.serverId,
    });
    if (homeAgentIds.length > 0) {
        const connection = await connectHausDatabase(harness.databaseUrl);
        try {
            await connection.db
                .update(agentsTable)
                .set({ homeProjectId: chat.id })
                .where(inArray(agentsTable.id, [...homeAgentIds]));
        } finally {
            await connection.close();
        }
    }
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
