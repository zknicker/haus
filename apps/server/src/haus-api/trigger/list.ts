import { triggerListInputSchema, triggerListSchema } from '@haus/api';
import { listOperatorTriggers } from '../../triggers/operator-triggers.ts';
import { triggerProcedure } from './procedure.ts';

export const listTriggersProcedure = triggerProcedure
    .input(triggerListInputSchema)
    .output(triggerListSchema)
    .query(async ({ ctx, input }) =>
        listOperatorTriggers(ctx.hausDb, ctx.member, { ...input, origin: ctx.requestOrigin })
    );
