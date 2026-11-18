import { taskKeyCreateInputSchema, taskKeyCreateResultSchema } from '@haus/api';

import { publishRealtime } from '../../realtime/topic.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { createTaskKey } from '../../tasks/task-keys.ts';
import { taskProcedure } from '../task/procedure.ts';

export const createTaskKeyProcedure = taskProcedure
    .input(taskKeyCreateInputSchema)
    .output(taskKeyCreateResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createTaskKey(ctx.hausDb, memberTaskActor(ctx.member), input);
        publishRealtime(result.events);
        return { taskKey: result.taskKey };
    });
