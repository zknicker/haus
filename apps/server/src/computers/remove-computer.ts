import { and, eq, isNull, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable, serverOnboardingTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ComputerSetupDeniedError } from './service.ts';

/** A Computer credential is deleted only after every assigned Agent is retired. */
export async function removeServerComputer(
    db: HausDatabase,
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
            .update(serverOnboardingTable)
            .set({ computerId: null })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, input.serverId),
                    eq(serverOnboardingTable.computerId, computer.id),
                    eq(serverOnboardingTable.phase, 'complete')
                )
            );
        await tx
            .update(serverOnboardingTable)
            .set({
                computerId: null,
                failureCode: null,
                failureDetail: null,
                phase: 'awaiting-computer',
            })
            .where(
                and(
                    eq(serverOnboardingTable.serverId, input.serverId),
                    eq(serverOnboardingTable.computerId, computer.id),
                    ne(serverOnboardingTable.phase, 'complete')
                )
            );
        await tx
            .update(agentsTable)
            .set({ computerId: null, desiredModelId: null, desiredRuntimeId: null })
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.computerId, computer.id)
                )
            );
        await tx.delete(computersTable).where(eq(computersTable.id, computer.id));
        return { computerId: computer.id };
    });
}
