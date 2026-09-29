import { inboxNeedsYouInputSchema, needsYouListSchema } from '@haus/api';
import { listNeedsYou } from '../../needs-you/list-needs-you.ts';
import { inboxProcedure } from './procedure.ts';

export const needsYouProcedure = inboxProcedure
    .input(inboxNeedsYouInputSchema)
    .output(needsYouListSchema)
    .query(async ({ ctx, input }) => await listNeedsYou(ctx.hausDb, ctx.member, input));
