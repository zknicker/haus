import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';

export class InvalidClaimAssigneeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidClaimAssigneeError';
    }
}

export interface ResolvedClaimAssignee {
    agentId: null | string;
    /** The assignee's handle, for the assignment receipt. */
    handle: null | string;
}

/**
 * Validates who a claim may be handed to. Only an Agent holds a claim (ADR
 * 0037), and it must be active and able to read the parent Chat: any Agent in a
 * Project, only its own Agent in a DM.
 */
export async function resolveClaimAssignee(
    db: HausDatabase,
    input: {
        assignee: { agentId: string } | null;
        chatId: string;
        serverId: string;
    }
): Promise<ResolvedClaimAssignee> {
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
        throw new InvalidClaimAssigneeError(
            'The assigned Agent must be an active Agent on this Server.'
        );
    }
    const participates = await agentReadsChat(db, {
        agentId,
        chatId: input.chatId,
        serverId: input.serverId,
    });
    if (!participates) {
        throw new InvalidClaimAssigneeError('The assigned Agent must belong to the parent Chat.');
    }
    return { agentId, handle: agent.handle };
}

async function agentReadsChat(
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
    return chat.kind !== 'dm' || chat.dmAgentId === input.agentId;
}
