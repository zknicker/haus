import { taskDetailSchema, taskGetInputSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { getTask } from '../../tasks/task-list.ts';
import { taskProcedure } from './procedure.ts';

export const getTaskProcedure = taskProcedure
    .input(taskGetInputSchema)
    .output(taskDetailSchema)
    .query(async ({ ctx, input }) => await getTask(ctx.hausDb, memberTaskActor(ctx.member), input));
