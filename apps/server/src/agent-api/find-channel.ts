import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { AgentTargetError } from './resolve-target.ts';

export async function findChannel(db: HausDatabase, serverId: string, target: string) {
    const name = target.startsWith('#') ? target.slice(1) : target;
    const [channel] = await db
        .select({
            description: chatsTable.description,
            id: chatsTable.id,
            isAll: chatsTable.isAll,
            name: chatsTable.name,
        })
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
    return {
        description: channel.description,
        id: channel.id,
        isAll: channel.isAll,
        name: channel.name,
    };
}
