import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    usersTable,
} from '../postgres/schema.ts';
import type { RoutingState } from './jev.ts';

export async function readRoutingAgents(db: HausDatabase, serverId: string, chatId: string) {
    return await db
        .select({
            id: agentsTable.id,
            handle: agentsTable.handle,
            name: agentsTable.displayName,
            description: agentsTable.description,
        })
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
                eq(channelAgentParticipantsTable.serverId, serverId),
                eq(channelAgentParticipantsTable.chatId, chatId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(asc(agentsTable.id))
        .limit(33);
}

export async function readRoutingState(
    db: HausDatabase,
    input: {
        serverId: string;
        chatId: string;
        sequence: number;
        authorId: string;
        content: string;
        agents: Awaited<ReturnType<typeof readRoutingAgents>>;
        eligibleAgentIds: string[];
    }
): Promise<RoutingState | null> {
    const rows = await db
        .select({
            id: chatMessagesTable.id,
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                lte(chatMessagesTable.sequence, input.sequence)
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(16);
    if (
        !rows.length ||
        rows.reduce((size, row) => size + row.content.length, input.content.length) > 24_000
    ) {
        return null;
    }
    const humanIds = [
        ...new Set([
            input.authorId,
            ...rows.flatMap((row) => (row.authorUserId ? [row.authorUserId] : [])),
        ]),
    ];
    const humans = await db
        .select({ id: usersTable.id, name: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, humanIds));
    const now = Date.now();
    const history: RoutingState['history'] = [];
    for (const row of [...rows].reverse()) {
        const authorId = row.authorAgentId ?? row.authorUserId;
        if (!authorId) {
            return null;
        }
        history.push({
            id: row.id,
            authorId,
            text: row.content,
            secondsBeforeCurrent: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 1000)),
            explicitAgentIds: [...mentionedAgentIds(row.content, input.agents)],
        });
    }
    return {
        channel: {
            id: input.chatId,
            name: null,
            participants: [
                ...input.agents.map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                    description: agent.description,
                    kind: 'agent' as const,
                })),
                ...humans.map((human) => ({ ...human, kind: 'human' as const })),
            ],
        },
        eligibleAgentIds: input.eligibleAgentIds,
        history,
        currentMessage: {
            authorId: input.authorId,
            text: input.content,
            explicitAgentIds: [],
            replyRecipientAgentIds: [],
        },
    };
}
