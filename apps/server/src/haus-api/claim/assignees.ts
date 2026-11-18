import { claimAssigneesInputSchema, claimAssigneesSchema } from '@haus/api';
import { listClaimAssignees } from '../../claims/list-claim-assignees.ts';
import { claimProcedure } from './procedure.ts';

export const claimAssigneesProcedure = claimProcedure
    .input(claimAssigneesInputSchema)
    .output(claimAssigneesSchema)
    .query(async ({ ctx, input }) => await listClaimAssignees(ctx.hausDb, ctx.member, input));
