import type { AgentSetMachineInput } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { AgentConfigDeniedError } from '../server-agents/agent-config-errors.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { destinationAllows } from './machine-authority.ts';
import { dropPendingChange, recordPendingChange } from './machine-change-store.ts';

export async function requestMachineChange(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentSetMachineInput,
    isOnline: (computerId: string) => boolean
) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
            throw new AgentConfigDeniedError(
                'Only a Server Owner or Admin can change a Captain’s Machine.'
            );
        }
        const scope = { agentId: input.agentId, serverId: input.serverId };
        const [agent] = await tx
            .select({ computerId: agentsTable.computerId })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, input.agentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (!agent?.computerId) {
            throw new AgentConfigDeniedError('No configured Agent exists with that id.');
        }
        if (agent.computerId === input.computerId) {
            await dropPendingChange(tx, scope);
            return;
        }
        const [destination] = await tx
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(
                and(
                    eq(computersTable.serverId, input.serverId),
                    eq(computersTable.id, input.computerId)
                )
            )
            .limit(1);
        if (!destination) {
            throw new AgentConfigDeniedError('That Device is no longer attached to this Server.');
        }
        if (!(await destinationAllows(tx, { ...input, userId: member.id }))) {
            throw new AgentConfigDeniedError(
                'This Captain has no access to that Device. Its attacher can give access, or make the change themselves.'
            );
        }
        await recordPendingChange(tx, {
            ...scope,
            computerId: input.computerId,
            fromLastSynced: input.fromLastSynced && !isOnline(agent.computerId),
            requestedByUserId: member.id,
        });
    });
}
