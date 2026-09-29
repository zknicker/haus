import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, channelAgentParticipantsTable, chatsTable } from '../postgres/schema.ts';

export class InvalidTaskAssigneeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidTaskAssigneeError';
    }
}

export interface ResolvedTaskAssignee {
    agentId: null | string;
    /** The assignee's handle, for the assignment receipt. */
    handle: null | string;
}

/**
 * Validates who a task may be handed to. Only an Agent holds a task (ADR
 * 0037), and it must be active and already a participant of the parent Chat —
 * it has to be able to read the conversation to do the work.
 */
export async function resolveTaskAssignee(
    db: HausDatabase,
    input: {
        assignee: { agentId: string } | null;
        chatId: string;
        serverId: string;
    }
): Promise<ResolvedTaskAssignee> {
    if (!input.assignee) {
        return { agentId: null, handle: null };
    }

    const agentId = input.assignee.agentId;
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new InvalidTaskAssigneeError(
            'The assigned Agent must be an active Agent on this Server.'
        );
    }
    const participates = await agentParticipatesInChat(db, {
        agentId,
        chatId: input.chatId,
        serverId: input.serverId,
    });
    if (!participates) {
        throw new InvalidTaskAssigneeError('The assigned Agent must belong to the parent Chat.');
    }
    return { agentId, handle: agent.handle };
}

async function agentParticipatesInChat(
    db: HausDatabase,
    input: { agentId: string; chatId: string; serverId: string }
): Promise<boolean> {
    const [chat] = await db
        .select({ dmAgentId: chatsTable.dmAgentId, kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat) {
        return false;
    }
    if (chat.kind === 'dm') {
        return chat.dmAgentId === input.agentId;
    }

    const [participant] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, input.chatId),
                eq(channelAgentParticipantsTable.agentId, input.agentId)
            )
        )
        .limit(1);
    return Boolean(participant);
}
