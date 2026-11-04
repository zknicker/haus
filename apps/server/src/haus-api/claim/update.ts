import { claimMutationSchema, claimUpdateInputSchema } from '@haus/api';
import { updateClaim } from '../../claims/update-claim.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { claimProcedure } from './procedure.ts';

export const updateClaimProcedure = claimProcedure
    .input(claimUpdateInputSchema)
    .output(claimMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await updateClaim(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return { claim: result.claim };
    });
