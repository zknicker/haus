import { taskLabelListInputSchema, taskLabelListSchema } from '@haus/api';
import { listTaskLabels } from '../../task-labels/task-labels.ts';
import { claimProcedure } from '../claim/procedure.ts';

export const listTaskLabelsProcedure = claimProcedure
    .input(taskLabelListInputSchema)
    .output(taskLabelListSchema)
    .query(async ({ ctx, input }) => await listTaskLabels(ctx.hausDb, ctx.member, input.serverId));
