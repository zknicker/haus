import { taskLabelCreateInputSchema, taskLabelMutationSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { createTaskLabel } from '../../task-labels/task-labels.ts';
import { claimProcedure } from '../claim/procedure.ts';

export const createTaskLabelProcedure = claimProcedure
    .input(taskLabelCreateInputSchema)
    .output(taskLabelMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createTaskLabel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return { label: result.label };
    });
