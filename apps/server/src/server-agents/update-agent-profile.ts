import type { Agent, UpdateAgentProfileInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';
import { assertAgentDescriptionWrite } from './errors.ts';
import { listAgents } from './list-agents.ts';

export async function updateAgentProfile(
    db: HausDatabase,
    member: HausUser | null,
    input: UpdateAgentProfileInput
): Promise<Agent> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentConfigDeniedError('Only a Server Owner or Admin can edit an Agent.');
    }

    const [identity] = await db
        .select({ description: agentsTable.description, factoryKind: agentsTable.factoryKind })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (identity?.factoryKind === 'cove') {
        throw new AgentConfigDeniedError("Cove's product-owned identity cannot be changed.");
    }
    assertAgentDescriptionWrite(input.description, identity?.description ?? null);

    const [updated] = await db
        .update(agentsTable)
        .set({
            description: input.description,
            displayName: input.displayName,
            // Absent leaves the personality alone; null or blank clears it.
            ...(input.personality === undefined ? {} : { personality: input.personality || null }),
        })
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .returning({ id: agentsTable.id });
    if (!updated) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }

    const agent = (await listAgents(db, member, input.serverId)).find(
        (candidate) => candidate.id === input.agentId
    );
    if (!agent) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    return agent;
}
