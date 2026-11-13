import { claimCreateInputSchema, claimPromotionSchema } from '@haus/api';
import { createClaim } from '../../claims/create-claim.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { claimProcedure } from './procedure.ts';

export const createClaimProcedure = claimProcedure
    .input(claimCreateInputSchema)
    .output(claimPromotionSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createClaim(ctx.hausDb, ctx.member, input, ctx.agentDelivery);

        publishRealtime(result.events);
        await ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.wakes);

        return { idempotent: result.idempotent, claim: result.claim };
    });
