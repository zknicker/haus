import type { AgentConnectionAdmin, SetAgentConnectionAdminInput } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

/**
 * Owner/Admin write of one Agent's connection admin flag. Only a human session reaches this; no
 * Agent API route sets it, so an Agent can never make itself or another Agent an admin.
 */
export async function setAgentConnectionAdmin(
    db: HausDatabase,
    member: HausUser | null,
    input: SetAgentConnectionAdminInput
): Promise<AgentConnectionAdmin> {
    // Behind the Server lock, like a grant write, so an in-flight Agent grant sees the change.
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const access = await requireServerMembership(tx, member, input.serverId);
        if (!member || (access.role !== 'owner' && access.role !== 'admin')) {
            throw new AgentConfigDeniedError(
                'Only a Server Owner or Admin can make an Agent a connection admin.'
            );
        }
        const [updated] = await tx
            .update(agentsTable)
            .set({ connectionAdmin: input.connectionAdmin })
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, input.agentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .returning({ agentId: agentsTable.id, connectionAdmin: agentsTable.connectionAdmin });
        if (!updated) {
            throw new AgentConfigDeniedError('No configured Agent exists with that id.');
        }
        return updated;
    });
}
