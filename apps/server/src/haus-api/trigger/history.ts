import { triggerHistoryInputSchema, triggerHistorySchema } from '@haus/api';
import { listOperatorTriggerHistory } from '../../triggers/trigger-history.ts';
import { triggerProcedure } from './procedure.ts';

export const listTriggerHistoryProcedure = triggerProcedure
    .input(triggerHistoryInputSchema)
    .output(triggerHistorySchema)
    .query(async ({ ctx, input }) => listOperatorTriggerHistory(ctx.hausDb, ctx.member, input));
