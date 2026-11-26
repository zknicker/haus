import type { AgentCrewDefaultsInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

export async function setCrewDefaults(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentCrewDefaultsInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        const [captain] = await tx
            .select({ kind: agentsTable.kind, retiredAt: agentsTable.retiredAt })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);
        if (!captain || captain.kind !== 'captain' || captain.retiredAt) {
            throw new AgentConfigDeniedError('Only an active Captain has crew defaults.');
        }
        if (input.crewComputerId !== null) {
            const [computer] = await tx
                .select({ id: computersTable.id })
                .from(computersTable)
                .where(
                    and(
                        eq(computersTable.serverId, input.serverId),
                        eq(computersTable.id, input.crewComputerId)
                    )
                )
                .limit(1);
            if (!computer) {
                throw new AgentConfigDeniedError('That Machine is not attached to this Server.');
            }
        }
        await tx
            .update(agentsTable)
            .set({ crewComputerId: input.crewComputerId, crewModel: input.crewModel })
            .where(
                and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId))
            );
        return {
            agentId: input.agentId,
            crewComputerId: input.crewComputerId,
            crewModel: input.crewModel,
        };
    });
}
