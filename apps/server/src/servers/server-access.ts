import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatsTable,
    serverMembershipsTable,
    serverOnboardingTable,
    serversTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { ServerDetail, ServerRole, ServerSummary } from './contracts.ts';

export class ServerNotFoundError extends Error {
    constructor(address: string) {
        super(`No Haus server exists at ${address}.`);
        this.name = 'ServerNotFoundError';
    }
}

export class ServerAccessDeniedError extends Error {
    constructor() {
        super('You are not a member of this Haus server.');
        this.name = 'ServerAccessDeniedError';
    }
}

/**
 * The one authorization gate for Server-scoped work. Every query, mutation, and
 * subscription resolves membership through here before touching Server state.
 * A human with no Haus User yet is simply not a member.
 */
export async function requireServerMembership(
    db: Pick<HausDatabase, 'select'>,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
): Promise<ServerSummary> {
    const [server] = await db
        .select({
            displayName: serversTable.displayName,
            id: serversTable.id,
            role: serverMembershipsTable.role,
            slug: serversTable.slug,
        })
        .from(serversTable)
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, serversTable.id),
                eq(serverMembershipsTable.userId, member?.id ?? ''),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(and(eq(serversTable.id, serverId), isNull(serversTable.deletedAt)))
        .limit(1);

    if (!server) {
        throw new ServerNotFoundError(serverId);
    }

    if (server.role === null) {
        throw new ServerAccessDeniedError();
    }

    return { ...server, role: server.role as ServerRole };
}

/** Opens one Haus server at its human-facing address, with its Channels. */
export async function openServerBySlug(
    db: HausDatabase,
    member: HausUser | null,
    slug: string
): Promise<ServerDetail> {
    const [found] = await db
        .select({ id: serversTable.id })
        .from(serversTable)
        .where(and(eq(serversTable.slug, slug), isNull(serversTable.deletedAt)))
        .limit(1);

    if (!found) {
        throw new ServerNotFoundError(`/${slug}`);
    }

    const server = await requireServerMembership(db, member, found.id);
    const [onboarding] = await db
        .select()
        .from(serverOnboardingTable)
        .where(eq(serverOnboardingTable.serverId, server.id))
        .limit(1);
    if (!onboarding) {
        throw new Error('A fresh Server must own onboarding progress.');
    }
    const channels = await db
        .select({ id: chatsTable.id, name: chatsTable.name })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, server.id),
                eq(chatsTable.kind, 'channel'),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt)
            )
        )
        .orderBy(asc(chatsTable.name));

    return {
        ...server,
        channels: channels
            .filter(
                (channel) => onboarding.phase === 'complete' || channel.id !== onboarding.channelId
            )
            .map((channel) => ({
                id: channel.id,
                name: requireChannelName(channel.name),
            })),
        onboarding: {
            agentId: onboarding.agentId,
            applicationId: onboarding.applicationId,
            channelId: onboarding.channelId,
            computerId: onboarding.computerId,
            failure:
                onboarding.failureCode && onboarding.failureDetail
                    ? { code: onboarding.failureCode, detail: onboarding.failureDetail }
                    : null,
            modelId: onboarding.modelId,
            phase: onboarding.phase,
            runtimeId: onboarding.runtimeId,
        },
        viewerUserId: member?.id ?? '',
    };
}

function requireChannelName(name: string | null) {
    if (name === null) {
        throw new Error('A Channel must have a name.');
    }

    return name;
}
