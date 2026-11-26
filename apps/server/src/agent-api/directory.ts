import { and, asc, eq, ilike, isNull } from 'drizzle-orm';
import { listHomeAgents } from '../agent-delivery/hearing.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelParticipantsTable,
    chatsTable,
    projectsTable,
    serverMembershipsTable,
    taskKeysTable,
    usersTable,
} from '../postgres/schema.ts';
import {
    countAgentDirectory,
    countChannelHumans,
    directoryChannelsWhere,
} from './directory-counts.ts';
import { AgentTargetError } from './resolve-target.ts';

export interface AgentDirectoryQuery {
    agents: boolean;
    channels: boolean;
    home: boolean;
    humans: boolean;
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
    const homeAgents = await listHomeAgents(db, {
        projectId: channel.id,
        serverId: runner.serverId,
    });
    const humans = await countChannelHumans(db, runner, channel.id);
    // `handle` is the bare name; the CLI renders the `#`.
    return {
        description: channel.description,
        handle: channel.name,
        home: homeAgents.some((agent) => agent.id === runner.agentId),
        homeAgents: homeAgents.map((agent) => agent.handle),
        memberCount: humans + homeAgents.length,
        project: channel.project,
    };
}

export async function readAgentChannelMembers(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const channel = await findChannel(db, runner.serverId, target);
    const agents = await db
        .select({ description: agentsTable.description, handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.homeProjectId, channel.id),
                isNull(agentsTable.retiredAt),
                eq(agentsTable.kind, 'captain')
            )
        )
        .orderBy(asc(agentsTable.handle));
    const humans = await db
        .select({
            description: usersTable.description,
            handle: serverMembershipsTable.handle,
            timezone: usersTable.timezone,
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
        );
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
                timezone: human.timezone,
            })),
        ],
        project: channel.project,
        target: `#${channel.name}`,
    };
}

async function listChannels(db: HausDatabase, runner: ResolvedRunner, input: AgentDirectoryQuery) {
    const rows = await db
        .select({ name: chatsTable.name })
        .from(chatsTable)
        .where(directoryChannelsWhere(runner, input))
        .orderBy(asc(chatsTable.name))
        .offset(input.offset)
        .limit(input.limit);
    const channels = [];
    for (const row of rows) {
        channels.push(await readAgentChannelInfo(db, runner, `#${row.name}`));
    }
    return channels;
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
                eq(agentsTable.kind, 'captain'),
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
            timezone: usersTable.timezone,
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
            rows.map((row) => ({
                description: row.description,
                handle: row.handle,
                id: row.id,
                // A human's zone is how an Agent resolves their calendar reminders.
                timezone: row.timezone,
            }))
        );
}

async function findChannel(db: HausDatabase, serverId: string, target: string) {
    const name = target.startsWith('#') ? target.slice(1) : target;
    const [channel] = await db
        .select({
            description: chatsTable.description,
            id: chatsTable.id,
            name: chatsTable.name,
            project: taskKeysTable.key,
        })
        .from(chatsTable)
        .leftJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, chatsTable.serverId),
                eq(projectsTable.chatId, chatsTable.id)
            )
        )
        .leftJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'channel'),
                eq(chatsTable.name, name),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    if (!channel?.name) {
        throw new AgentTargetError('That channel does not exist.');
    }
    return { ...channel, name: channel.name };
}

function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}
