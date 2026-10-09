import { taskLabelDeleteInputSchema, taskLabelMutationSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { deleteTaskLabel } from '../../tasks/task-labels.ts';
import { taskProcedure } from '../task/procedure.ts';

export const deleteTaskLabelProcedure = taskProcedure
    .input(taskLabelDeleteInputSchema)
    .output(taskLabelMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await deleteTaskLabel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return { label: null };
    });
