import { and, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { failRemovedCarrierTurns } from '../workers/fail-removed-carrier-turns.ts';
import { ComputerSetupDeniedError } from './service.ts';

/**
 * A Computer credential is deleted only after every assigned Agent is retired.
 * The Worker turns it carried fail `machine-removed` in the same transaction.
 */
export async function removeServerComputer(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    member: HausUser | null,
    input: { computerId: string; confirmation: string; serverId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
            throw new ComputerSetupDeniedError(
                'Only a Server Owner or Admin can remove a Computer.'
            );
        }
        if (input.confirmation !== 'REMOVE') {
            throw new ComputerSetupDeniedError('Type REMOVE to remove this Computer.');
        }
        const [computer] = await tx
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(
                and(
                    eq(computersTable.id, input.computerId),
                    eq(computersTable.serverId, input.serverId)
                )
            )
            .limit(1);
        if (!computer) {
            throw new ComputerSetupDeniedError('That Computer no longer exists.');
        }
        const [assigned] = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (assigned) {
            throw new ComputerSetupDeniedError(
                'Delete every assigned Agent before removing this Computer.'
            );
        }
        await tx
            .update(agentsTable)
            .set({ computerId: null, desiredModelId: null, desiredRuntimeId: null })
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id)
                )
            );
        const workers = await failRemovedCarrierTurns(tx, agentDelivery, {
            computerId: computer.id,
            serverId: input.serverId,
        });
        await tx.delete(computersTable).where(eq(computersTable.id, computer.id));
        return { computerId: computer.id, workers };
    });
}
