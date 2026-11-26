import { and, count, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
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

export async function countChannelHumans(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
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
    return Number(humans?.total ?? 0);
}

async function countChannels(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const [row] = await db
        .select({ total: count() })
        .from(chatsTable)
        .where(directoryChannelsWhere(runner, input));
    return Number(row?.total ?? 0);
}

async function countAgents(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const [row] = await db
        .select({ total: count() })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                isNull(agentsTable.retiredAt), eq(agentsTable.kind, 'captain'),
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

export function directoryChannelsWhere(
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    input: Pick<AgentDirectoryQuery, 'home' | 'query'>
) {
    return and(
        eq(chatsTable.serverId, runner.serverId),
        eq(chatsTable.kind, 'channel'),
        isNull(chatsTable.deletedAt),
        input.home
            ? sql`${chatsTable.id} = (
                select agent.home_project_id from agents agent
                where agent.server_id = ${runner.serverId} and agent.id = ${runner.agentId}
            )`
            : undefined,
        input.query ? ilike(chatsTable.name, `%${escapeLike(input.query)}%`) : undefined
    );
}

function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}
