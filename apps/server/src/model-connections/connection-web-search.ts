import {
    type ModelConnectionSetWebSearchInput,
    type ModelProvider,
    modelProvidersWithWebSearch,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { WebSearchUnsupportedError } from './model-connection-errors.ts';
import { readModelConnection, requireConnectionsOwner } from './read-model-connections.ts';

export async function setModelConnectionWebSearch(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionSetWebSearchInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        const connection = await readModelConnection(tx, input.serverId, input.connectionId);
        if (input.enabled && !searchableProviders.includes(connection.provider)) {
            throw new WebSearchUnsupportedError();
        }
        await tx
            .update(modelConnectionsTable)
            .set({ updatedAt: new Date(), webSearch: input.enabled })
            .where(
                and(
                    eq(modelConnectionsTable.serverId, input.serverId),
                    eq(modelConnectionsTable.id, input.connectionId)
                )
            );
        return await readModelConnection(tx, input.serverId, input.connectionId);
    });
}

const searchableProviders: readonly ModelProvider[] = modelProvidersWithWebSearch;
