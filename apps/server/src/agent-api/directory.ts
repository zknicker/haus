import { and, asc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { joinChannelAgents } from '../chats/channel-agent-membership.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatsTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';
import { countAgentDirectory, countChannelMembers } from './directory-counts.ts';
import { AgentTargetError } from './resolve-target.ts';

export interface AgentDirectoryQuery {
    agents: boolean;
    channels: boolean;
    humans: boolean;
    joined: boolean;
    limit: number;
    offset: number;
    query?: string;
}

export async function readAgentServerDirectory(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentDirectoryQuery
) {
    const includeAll = !(input.agents || input.channels || input.humans);
    const [channels, agents, humans] = await Promise.all([
        includeAll || input.channels ? listChannels(db, runner, input) : Promise.resolve([]),
        includeAll || input.agents ? listAgents(db, runner, input) : Promise.resolve([]),
        includeAll || input.humans ? listHumans(db, runner, input) : Promise.resolve([]),
    ]);
    const totals = await countAgentDirectory(db, runner, input);
    return {
        agents,
        channels,
        hasMore: {
            agents: input.offset + agents.length < totals.agents,
            channels: input.offset + channels.length < totals.channels,
            humans: input.offset + humans.length < totals.humans,
        },
        humans,
        limit: input.limit,
        offset: input.offset,
        total: totals,
    };
}

export async function readAgentChannelInfo(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const channel = await findChannel(db, runner.serverId, target);
    const [joined, memberCount] = await Promise.all([
        isAgentJoined(db, runner, channel.id),
        countChannelMembers(db, runner, channel.id),
    ]);
    return {
        description: null,
        handle: `#${channel.name}`,
        joined,
        memberCount,
    };
}

export async function readAgentChannelMembers(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const channel = await findChannel(db, runner.serverId, target);
    if (!(await isAgentJoined(db, runner, channel.id))) {
        throw new AgentTargetError();
    }
    const [agents, humans] = await Promise.all([
        db
            .select({ description: agentsTable.description, handle: agentsTable.handle })
            .from(channelAgentParticipantsTable)
            .innerJoin(
                agentsTable,
                and(
                    eq(agentsTable.serverId, channelAgentParticipantsTable.serverId),
                    eq(agentsTable.id, channelAgentParticipantsTable.agentId)
                )
            )
            .where(
                and(
                    eq(channelAgentParticipantsTable.serverId, runner.serverId),
                    eq(channelAgentParticipantsTable.chatId, channel.id),
                    isNull(agentsTable.retiredAt)
                )
            )
            .orderBy(asc(agentsTable.handle)),
        db
            .select({
                description: usersTable.description,
                handle: serverMembershipsTable.handle,
            })
            .from(channelParticipantsTable)
            .innerJoin(
                serverMembershipsTable,
                and(
                    eq(serverMembershipsTable.serverId, channelParticipantsTable.serverId),
                    eq(serverMembershipsTable.userId, channelParticipantsTable.userId)
                )
            )
            .innerJoin(usersTable, eq(usersTable.id, channelParticipantsTable.userId))
            .where(
                and(
                    eq(channelParticipantsTable.serverId, runner.serverId),
                    eq(channelParticipantsTable.chatId, channel.id)
                )
            ),
    ]);
    return {
        members: [
            ...agents.map((agent) => ({
                description: agent.description,
                handle: agent.handle,
                role: 'agent' as const,
            })),
            ...humans.map((human) => ({
                description: human.description,
                handle: human.handle,
                role: 'human' as const,
            })),
        ],
        target: `#${channel.name}`,
    };
}

export async function changeAgentChannelMembership(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string,
    action: 'join' | 'leave'
) {
    const channel = await findChannel(db, runner.serverId, target);
    if (action === 'join') {
        await joinChannelAgents(db, {
            agentIds: [runner.agentId],
            chatId: channel.id,
            serverId: runner.serverId,
        });
        return { joined: true, target: `#${channel.name}` };
    }
    await db
        .delete(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, channel.id),
                eq(channelAgentParticipantsTable.agentId, runner.agentId)
            )
        );
    return { left: true, target: `#${channel.name}` };
}

async function listChannels(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const rows = await db
        .select({
            id: chatsTable.id,
            joined: sql<boolean>`${channelAgentParticipantsTable.agentId} is not null`,
            name: chatsTable.name,
        })
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
                input.joined
                    ? eq(channelAgentParticipantsTable.agentId, runner.agentId)
                    : undefined,
                input.query ? ilike(chatsTable.name, `%${escapeLike(input.query)}%`) : undefined
            )
        )
        .orderBy(asc(chatsTable.name))
        .offset(input.offset)
        .limit(input.limit);
    return await Promise.all(
        rows.map(async (row) => {
            const info = await readAgentChannelInfo(db, runner, `#${row.name}`);
            return { ...info, joined: row.joined };
        })
    );
}

async function listAgents(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    return await db
        .select({
            description: agentsTable.description,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                isNull(agentsTable.retiredAt),
                input.query ? ilike(agentsTable.handle, `%${escapeLike(input.query)}%`) : undefined
            )
        )
        .orderBy(asc(agentsTable.handle))
        .offset(input.offset)
        .limit(input.limit)
        .then((rows) =>
            rows.map((row) => ({ description: row.description, handle: row.handle, id: row.id }))
        );
}

async function listHumans(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    return await db
        .select({
            description: usersTable.description,
            handle: serverMembershipsTable.handle,
            id: serverMembershipsTable.userId,
        })
        .from(serverMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
        .where(
            and(
                eq(serverMembershipsTable.serverId, runner.serverId),
                isNull(serverMembershipsTable.revokedAt),
                input.query
                    ? ilike(serverMembershipsTable.handle, `%${escapeLike(input.query)}%`)
                    : undefined
            )
        )
        .orderBy(asc(serverMembershipsTable.handle), asc(serverMembershipsTable.userId))
        .offset(input.offset)
        .limit(input.limit)
        .then((rows) =>
            rows.map((row) => ({ description: row.description, handle: row.handle, id: row.id }))
        );
}

async function findChannel(db: HausDatabase, serverId: string, target: string) {
    const name = target.startsWith('#') ? target.slice(1) : target;
    const [channel] = await db
        .select({ id: chatsTable.id, name: chatsTable.name })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'channel'),
                eq(chatsTable.name, name)
            )
        )
        .limit(1);
    if (!channel?.name) {
        throw new AgentTargetError('That channel does not exist.');
    }
    return { id: channel.id, name: channel.name };
}

async function isAgentJoined(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
    const [row] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, chatId),
                eq(channelAgentParticipantsTable.agentId, runner.agentId)
            )
        )
        .limit(1);
    return Boolean(row);
}

function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}
