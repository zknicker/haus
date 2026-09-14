import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { computerUpdateInputSchema } from '../../computers/contracts.ts';
import { recordComputerRuntimeInventory } from '../../computers/record-inventory.ts';
import { computersTable } from '../../postgres/schema.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';
import { emitServerUpdated } from '../server-events.ts';

export const refreshComputerInventoryProcedure = memberProcedure
    .input(computerUpdateInputSchema.omit({ targetVersion: true }))
    .mutation(async ({ ctx, input }) => {
        const membership = await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        if (membership.role !== 'owner' && membership.role !== 'admin') {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Only a Server Owner or Admin can refresh a Computer.',
            });
        }
        const [computer] = await ctx.hausDb
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
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'That Computer is not attached to this Server.',
            });
        }
        const runtimes = await ctx.computerConnections.inventoryRefresh.request(computer.id);
        await recordComputerRuntimeInventory(ctx.hausDb, computer.id, runtimes);
        emitServerUpdated({ computerId: computer.id, scope: 'computer', serverId: input.serverId });
        return { runtimeCount: runtimes.length };
    });
