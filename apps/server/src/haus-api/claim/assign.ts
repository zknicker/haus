import { claimAssignInputSchema, claimMutationSchema } from '@haus/api';
import { assignClaim } from '../../claims/assign-claim.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { claimProcedure } from './procedure.ts';

export const assignClaimProcedure = claimProcedure
    .input(claimAssignInputSchema)
    .output(claimMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = ctx.member ? { kind: 'human' as const, member: ctx.member } : null;
        const result = await assignClaim(ctx.hausDb, actor, ctx.agentDelivery, input);

        publishRealtime(result.events);
        // Waking the assignee is what turns a reservation into work: the Agent
        // comes up, takes the claim, and starts.
        await ctx.postCommitWork.wakeAgents(
            ctx.agentDelivery,
            result.wakes.map((agentId) => ({ agentId, serverId: input.serverId }))
        );

        return { claim: result.claim };
    });
