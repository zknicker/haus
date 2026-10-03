import type { AgentPersonality } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

/**
 * The Agent's private personality, for the humans who may change it. It is the one identity field
 * kept off the member-wide Agent record, so it has its own Owner/Admin read.
 */
export async function readAgentPersonality(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<AgentPersonality> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentConfigDeniedError(
            "Only a Server Owner or Admin can read an Agent's personality."
        );
    }
    const [agent] = await db
        .select({ personality: agentsTable.personality })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!agent) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    return { personality: agent.personality };
}
