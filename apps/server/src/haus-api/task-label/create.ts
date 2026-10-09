import { taskLabelCreateInputSchema, taskLabelMutationSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { createTaskLabel } from '../../tasks/task-labels.ts';
import { taskProcedure } from '../task/procedure.ts';

export const createTaskLabelProcedure = taskProcedure
    .input(taskLabelCreateInputSchema)
    .output(taskLabelMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createTaskLabel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return { label: result.label };
    });
