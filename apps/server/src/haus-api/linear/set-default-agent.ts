import { linearSetDefaultAgentInputSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import { holdsGrant, requireLinearAdmin, requireLinearWorkspace } from '../../linear/authority.ts';
import { LinearRefusedError } from '../../linear/linear-errors.ts';
import { linearWorkspacesTable } from '../../postgres/schema.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { announceLinearUpdated, linearClock, linearProcedure } from './procedure.ts';

/** The Agent Haus app sessions route to when nothing else names one; it must hold the grant. */
export const linearSetDefaultAgent = linearProcedure
    .input(linearSetDefaultAgentInputSchema)
    .mutation(async ({ ctx, input }) => {
        await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireLinearAdmin(tx, ctx.member, input.serverId);
            const workspace = await requireLinearWorkspace(tx, input);
            if (input.agentId && !(await holdsGrant(tx, { ...input, agentId: input.agentId }))) {
                throw new LinearRefusedError(
                    'BAD_REQUEST',
                    'linear_agent_not_granted',
                    'Grant this Agent the Linear connection first.'
                );
            }
            await tx
                .update(linearWorkspacesTable)
                .set({ defaultAgentId: input.agentId, updatedAt: linearClock.now() })
                .where(eq(linearWorkspacesTable.id, workspace.id));
        });
        announceLinearUpdated(input);
    });
