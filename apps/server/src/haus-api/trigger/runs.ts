import { triggerRunsInputSchema, triggerRunsSchema } from '@haus/api';
import { listOperatorTriggerRuns } from '../../triggers/operator-triggers.ts';
import { triggerProcedure } from './procedure.ts';

export const listTriggerRunsProcedure = triggerProcedure
    .input(triggerRunsInputSchema)
    .output(triggerRunsSchema)
    .query(async ({ ctx, input }) =>
        listOperatorTriggerRuns(ctx.hausDb, ctx.member, { ...input, origin: ctx.requestOrigin })
    );
