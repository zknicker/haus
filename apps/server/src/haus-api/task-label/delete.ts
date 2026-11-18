import { taskLabelDeleteInputSchema, taskLabelMutationSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { deleteTaskLabel } from '../../task-labels/task-labels.ts';
import { claimProcedure } from '../claim/procedure.ts';

export const deleteTaskLabelProcedure = claimProcedure
    .input(taskLabelDeleteInputSchema)
    .output(taskLabelMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await deleteTaskLabel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return { label: null };
    });
