import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    channelParticipantsTable,
    chatsTable,
    serverMembershipsTable,
    serverOnboardingTable,
    serversTable,
} from '../postgres/schema.ts';
import { ensureUserByClerkId } from '../users/haus-user.ts';
import {
    allChannelDescription,
    allChannelName,
    onboardingOwnerChannelName,
    type ServerDetail,
} from './contracts.ts';

export interface CreateServerInput {
    clerkUserId: string;
    displayName: string;
    slug: string;
}

export class ServerSlugTakenError extends Error {
    constructor(slug: string) {
        super(`The Server address /${slug} is already taken.`);
        this.name = 'ServerSlugTakenError';
    }
}

/**
 * One transaction commits the whole Server: the creator's stable Haus User,
 * the opaque Server id, its immutable slug and editable display name, the first
 * human Owner membership, and `#all` with that Owner participating. It creates
 * no Computer, Agent, or execution configuration.
 */
export async function createServer(
    db: HausDatabase,
    input: CreateServerInput
): Promise<ServerDetail> {
    const server = { displayName: input.displayName, id: createOpaqueId('srv'), slug: input.slug };
    let viewerUserId = '';
    const channel = {
        description: allChannelDescription,
        id: createOpaqueId('cht'),
        isAll: true,
        kind: 'channel' as const,
        name: allChannelName,
        serverId: server.id,
    };
    const onboardingChannel = {
        id: createOpaqueId('cht'),
        isAll: false,
        kind: 'channel' as const,
        name: onboardingOwnerChannelName,
        serverId: server.id,
    };

    try {
        await db.transaction(async (tx) => {
            const owner = await ensureUserByClerkId(tx, input.clerkUserId);
            viewerUserId = owner.id;

            await tx.insert(serversTable).values(server);
            await tx.insert(serverMembershipsTable).values({
                id: createOpaqueId('mem'),
                role: 'owner',
                serverId: server.id,
                userId: owner.id,
            });
            await tx.insert(chatsTable).values(channel);
            await tx.insert(chatsTable).values(onboardingChannel);
            await tx.insert(channelParticipantsTable).values([
                { chatId: channel.id, serverId: server.id, userId: owner.id },
                { chatId: onboardingChannel.id, serverId: server.id, userId: owner.id },
            ]);
            await tx.insert(serverOnboardingTable).values({
                channelId: onboardingChannel.id,
                phase: 'awaiting-computer',
                serverId: server.id,
            });
        });
    } catch (cause) {
        if (violatesConstraint(cause, 'servers_slug_key')) {
            throw new ServerSlugTakenError(input.slug);
        }

        throw cause;
    }

    return {
        channels: [{ id: channel.id, name: channel.name }],
        displayName: server.displayName,
        id: server.id,
        onboarding: {
            agentId: null,
            applicationId: null,
            channelId: onboardingChannel.id,
            computerId: null,
            failure: null,
            modelId: null,
            phase: 'awaiting-computer',
            runtimeId: null,
        },
        role: 'owner',
        slug: server.slug,
        viewerUserId,
    };
}
