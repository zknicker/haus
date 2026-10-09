import { taskLabelMutationSchema, taskLabelUpdateInputSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { updateTaskLabel } from '../../tasks/task-labels.ts';
import { taskProcedure } from '../task/procedure.ts';

export const updateTaskLabelProcedure = taskProcedure
    .input(taskLabelUpdateInputSchema)
    .output(taskLabelMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await updateTaskLabel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return { label: result.label };
    });
