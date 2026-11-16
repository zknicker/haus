import { claimPromoteInputSchema, claimPromotionSchema } from '@haus/api';
import { promoteMessageClaim } from '../../claims/promote-claim.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { claimProcedure } from './procedure.ts';

export const promoteClaimProcedure = claimProcedure
    .input(claimPromoteInputSchema)
    .output(claimPromotionSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await promoteMessageClaim(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return { idempotent: result.idempotent, claim: result.claim };
    });
