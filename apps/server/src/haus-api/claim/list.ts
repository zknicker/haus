import { claimListInputSchema, claimListSchema } from '@haus/api';
import { listClaims } from '../../claims/list-claims.ts';
import { claimProcedure } from './procedure.ts';

export const listClaimsProcedure = claimProcedure
    .input(claimListInputSchema)
    .output(claimListSchema)
    .query(async ({ ctx, input }) => await listClaims(ctx.hausDb, ctx.member, input));
