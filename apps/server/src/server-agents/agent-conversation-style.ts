import type { AgentConversationStyle, AgentSelfProfileUpdateInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

type ConversationStyleChange = Pick<
    AgentSelfProfileUpdateInput,
    'conversationStyle' | 'signatureEmoji'
>;

interface AgentRef {
    agentId: string;
    serverId: string;
}

/**
 * The Agent's private conversation style and signature emoji, for the humans who may change
 * them. Both stay off the member-wide Agent record, so they have their own Owner/Admin read.
 */
export async function readAgentConversationStyle(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentRef
): Promise<AgentConversationStyle> {
    await requireOwnerOrAdmin(db, member, input.serverId, 'read');
    const agent = await selectConversationStyle(db, input);
    if (!agent) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    return { conversationStyle: agent.conversationStyle, signatureEmoji: agent.signatureEmoji };
}

/** Owner/Admin write of any Agent's conversation style and signature emoji. */
export async function updateAgentConversationStyle(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentRef & ConversationStyleChange
): Promise<AgentConversationStyle> {
    await requireOwnerOrAdmin(db, member, input.serverId, 'edit');
    return await writeAgentConversationStyle(db, input, input);
}

/**
 * Applies a conversation style change to one Agent. Absent fields stay; null or a blank style
 * clears. Cove's product-owned identity refuses a conversation style but keeps an emoji.
 */
export async function writeAgentConversationStyle(
    db: HausDatabase,
    agent: AgentRef,
    change: ConversationStyleChange
): Promise<AgentConversationStyle> {
    const current = await selectConversationStyle(db, agent);
    if (!current) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    if (current.factoryKind === 'cove' && change.conversationStyle) {
        throw new AgentConfigDeniedError(
            "Cove's product-owned identity cannot take a conversation style."
        );
    }
    const set = {
        ...(change.conversationStyle === undefined
            ? {}
            : { conversationStyle: change.conversationStyle || null }),
        ...(change.signatureEmoji === undefined ? {} : { signatureEmoji: change.signatureEmoji }),
    };
    if (Object.keys(set).length === 0) {
        return {
            conversationStyle: current.conversationStyle,
            signatureEmoji: current.signatureEmoji,
        };
    }
    const [updated] = await db
        .update(agentsTable)
        .set(set)
        .where(and(eq(agentsTable.serverId, agent.serverId), eq(agentsTable.id, agent.agentId)))
        .returning({
            conversationStyle: agentsTable.conversationStyle,
            signatureEmoji: agentsTable.signatureEmoji,
        });
    if (!updated) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    return updated;
}

async function requireOwnerOrAdmin(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string,
    verb: 'edit' | 'read'
) {
    const server = await requireServerMembership(db, member, serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentConfigDeniedError(
            `Only a Server Owner or Admin can ${verb} an Agent's conversation style.`
        );
    }
}

async function selectConversationStyle(db: HausDatabase, agent: AgentRef) {
    const [row] = await db
        .select({
            conversationStyle: agentsTable.conversationStyle,
            factoryKind: agentsTable.factoryKind,
            signatureEmoji: agentsTable.signatureEmoji,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, agent.serverId), eq(agentsTable.id, agent.agentId)))
        .limit(1);
    return row ?? null;
}
