import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    channelParticipantsTable,
    chatsTable,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import { allChannelDescription, allChannelName, type ServerDetail } from './contracts.ts';

export interface CreateServerInput {
    displayName: string;
    slug: string;
    userId: string;
}

export class ServerSlugTakenError extends Error {
    constructor(slug: string) {
        super(`The Server address /${slug} is already taken.`);
        this.name = 'ServerSlugTakenError';
    }
}

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
        name: allChannelName,
    };

    try {
        await db.transaction(async (tx) => {
            viewerUserId = input.userId;

            await tx.insert(serversTable).values(server);
            await tx.insert(serverMembershipsTable).values({
                id: createOpaqueId('mem'),
                role: 'owner',
                serverId: server.id,
                userId: input.userId,
            });
            await tx
                .insert(chatsTable)
                .values({ ...channel, kind: 'channel', serverId: server.id });
            await tx
                .insert(channelParticipantsTable)
                .values({ chatId: channel.id, serverId: server.id, userId: input.userId });
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
        role: 'owner',
        slug: server.slug,
        viewerUserId,
    };
}
