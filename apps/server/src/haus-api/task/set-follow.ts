import { taskFollowReceiptSchema, taskSetFollowInputSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { setTaskFollow } from '../../tasks/task-set-follow.ts';
import { taskProcedure } from './procedure.ts';

export const setTaskFollowProcedure = taskProcedure
    .input(taskSetFollowInputSchema)
    .output(taskFollowReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await setTaskFollow(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return result.receipt;
    });
