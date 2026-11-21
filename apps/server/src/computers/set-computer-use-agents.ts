import type { ComputerSetComputerUseAgentsInput } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable, computerUseAgentsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireComputerSteward } from './computer-steward.ts';

export class ComputerUseAgentsInvalidError extends Error {}

export async function setComputerUseAgents(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerSetComputerUseAgentsInput
) {
    return await db.transaction(async (tx) => {
        const computer = await requireComputerSteward(tx, member, input);
        const agentIds = input.agents.kind === 'named' ? [...new Set(input.agents.agentIds)] : [];
        if (agentIds.length > 0) {
            const onDevice = await tx
                .select({ id: agentsTable.id })
                .from(agentsTable)
                .where(
                    and(
                        eq(agentsTable.serverId, input.serverId),
                        eq(agentsTable.computerId, computer.id),
                        inArray(agentsTable.id, agentIds)
                    )
                );
            if (onDevice.length !== agentIds.length) {
                throw new ComputerUseAgentsInvalidError(
                    'Only Captains on this Device can be allowed to use it.'
                );
            }
        }
        await tx
            .update(computersTable)
            .set({ computerUseScope: input.agents.kind })
            .where(eq(computersTable.id, computer.id));
        await tx
            .delete(computerUseAgentsTable)
            .where(eq(computerUseAgentsTable.computerId, computer.id));
        if (agentIds.length > 0) {
            await tx.insert(computerUseAgentsTable).values(
                agentIds.map((agentId) => ({
                    agentId,
                    computerId: computer.id,
                    serverId: input.serverId,
                }))
            );
        }
        return { computerId: computer.id };
    });
}
