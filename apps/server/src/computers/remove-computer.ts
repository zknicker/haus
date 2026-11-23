import type { ComputerRemovalMove } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { moveAgentsOffRemovedComputer } from '../agent-machine/removal-moves.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { clearComputerDefaults } from '../projects/project-worker-defaults.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { failRemovedCarrierTurns } from '../workers/fail-removed-carrier-turns.ts';
import { ComputerSetupDeniedError } from './service.ts';

/**
 * Deletes a Computer credential, first changing the Machine of every live Agent on it to the
 * Computer `machineMoves` names (ADR 0057 decision 7). The Worker turns it carried fail
 * `machine-removed` in the same transaction.
 */
export async function removeServerComputer(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    member: HausUser | null,
    input: {
        computerId: string;
        confirmation: string;
        machineMoves: readonly ComputerRemovalMove[];
        serverId: string;
    },
    storage: ArtifactStorage | null
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
        const moved = await moveAgentsOffRemovedComputer(tx, {
            computerId: computer.id,
            moves: input.machineMoves,
            serverId: input.serverId,
            userId: member.id,
        });
        await tx
            .update(agentsTable)
            .set({ computerId: null, desiredModelId: null, desiredRuntimeId: null })
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id)
                )
            );
        const workers = await failRemovedCarrierTurns(tx, agentDelivery, storage, {
            computerId: computer.id,
            serverId: input.serverId,
        });
        const projectIds = await clearComputerDefaults(tx, input.serverId, computer.id);
        await tx.delete(computersTable).where(eq(computersTable.id, computer.id));
        return { computerId: computer.id, moved, projectIds, workers };
    });
}
