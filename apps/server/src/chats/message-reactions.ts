import type { ChatMessageReaction } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, messageReactionsTable, serverMembershipsTable } from '../postgres/schema.ts';

type MessageReactionReader = Pick<HausDatabase, 'select'>;
type MessageReactionWriter = Pick<HausDatabase, 'delete' | 'insert'>;

export type MessageReactionActor =
    | { actorAgentId: string; actorUserId?: never }
    | { actorAgentId?: never; actorUserId: string };

export async function readChatMessageReactions(
    db: MessageReactionReader,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, ChatMessageReaction[]>> {
    const byMessage = new Map<string, ChatMessageReaction[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }

    const rows = await db
        .select({
            actorAgentId: messageReactionsTable.actorAgentId,
            actorAgentHandle: agentsTable.handle,
            actorUserHandle: serverMembershipsTable.handle,
            actorUserId: messageReactionsTable.actorUserId,
            emoji: messageReactionsTable.emoji,
            messageId: messageReactionsTable.messageId,
        })
        .from(messageReactionsTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, messageReactionsTable.serverId),
                eq(agentsTable.id, messageReactionsTable.actorAgentId)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, messageReactionsTable.serverId),
                eq(serverMembershipsTable.userId, messageReactionsTable.actorUserId)
            )
        )
        .where(
            and(
                eq(messageReactionsTable.serverId, serverId),
                inArray(messageReactionsTable.messageId, messageIds)
            )
        )
        // First reaction first: clients stack reactions in the order they arrived.
        .orderBy(asc(messageReactionsTable.createdAt), asc(messageReactionsTable.emoji));

    for (const row of rows) {
        const actor = row.actorAgentId
            ? { handle: row.actorAgentHandle, id: row.actorAgentId, kind: 'agent' as const }
            : row.actorUserId
              ? { handle: row.actorUserHandle, id: row.actorUserId, kind: 'human' as const }
              : null;
        if (!actor) {
            throw new Error(`Message reaction ${row.messageId} has no actor.`);
        }

        const reactions = byMessage.get(row.messageId) ?? [];
        const reaction = reactions.find(({ emoji }) => emoji === row.emoji);
        if (reaction) {
            reaction.actors.push(actor);
        } else {
            reactions.push({ actors: [actor], emoji: row.emoji });
        }
        byMessage.set(row.messageId, reactions);
    }

    return byMessage;
}

export async function writeMessageReaction(
    db: MessageReactionWriter,
    input: MessageReactionActor & {
        emoji: string;
        messageId: string;
        remove: boolean;
        serverId: string;
    }
): Promise<boolean> {
    const actor =
        input.actorAgentId !== undefined
            ? eq(messageReactionsTable.actorAgentId, input.actorAgentId)
            : eq(messageReactionsTable.actorUserId, input.actorUserId);
    const predicate = and(
        eq(messageReactionsTable.serverId, input.serverId),
        eq(messageReactionsTable.messageId, input.messageId),
        eq(messageReactionsTable.emoji, input.emoji),
        actor
    );

    if (input.remove) {
        const deleted = await db
            .delete(messageReactionsTable)
            .where(predicate)
            .returning({ id: messageReactionsTable.messageId });
        return deleted.length > 0;
    }

    const inserted = await db
        .insert(messageReactionsTable)
        .values({
            actorAgentId: input.actorAgentId ?? null,
            actorUserId: input.actorUserId ?? null,
            emoji: input.emoji,
            messageId: input.messageId,
            serverId: input.serverId,
        })
        .onConflictDoNothing()
        .returning({ id: messageReactionsTable.messageId });
    return inserted.length > 0;
}
