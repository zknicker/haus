import { and, count, eq, ilike, isNull } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatsTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import type { AgentDirectoryQuery } from './directory.ts';

export async function countAgentDirectory(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentDirectoryQuery
) {
    const channels = await countChannels(db, runner, input);
    const agents = await countAgents(db, runner, input);
    const humans = await countHumans(db, runner, input);
    return { agents, channels, humans };
}

export async function countChannelMembers(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string
) {
    const [humans] = await db
        .select({ total: count() })
        .from(channelParticipantsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, channelParticipantsTable.serverId),
                eq(serverMembershipsTable.userId, channelParticipantsTable.userId)
            )
        )
        .where(
            and(
                eq(channelParticipantsTable.serverId, runner.serverId),
                eq(channelParticipantsTable.chatId, chatId),
                isNull(serverMembershipsTable.revokedAt)
            )
        );
    const [agents] = await db
        .select({ total: count() })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, chatId)
            )
        );
    return Number(humans?.total ?? 0) + Number(agents?.total ?? 0);
}

async function countChannels(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const [row] = await db
        .select({ total: count() })
        .from(chatsTable)
        .leftJoin(
            channelAgentParticipantsTable,
            and(
                eq(channelAgentParticipantsTable.serverId, chatsTable.serverId),
                eq(channelAgentParticipantsTable.chatId, chatsTable.id),
                eq(channelAgentParticipantsTable.agentId, runner.agentId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, runner.serverId),
                eq(chatsTable.kind, 'channel'),
                input.joined ? eq(channelAgentParticipantsTable.agentId, runner.agentId) : undefined
            )
        );
    return Number(row?.total ?? 0);
}

async function countAgents(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const [row] = await db
        .select({ total: count() })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                isNull(agentsTable.retiredAt),
                input.query ? ilike(agentsTable.handle, `%${escapeLike(input.query)}%`) : undefined
            )
        );
    return Number(row?.total ?? 0);
}

async function countHumans(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const [row] = await db
        .select({ total: count() })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, runner.serverId),
                isNull(serverMembershipsTable.revokedAt),
                input.query
                    ? ilike(serverMembershipsTable.handle, `%${escapeLike(input.query)}%`)
                    : undefined
            )
        );
    return Number(row?.total ?? 0);
}

function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}
