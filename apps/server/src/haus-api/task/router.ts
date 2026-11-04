import { createRouter } from '../trpc.ts';
import { assignTaskProcedure } from './assign.ts';
import { createTaskProcedure } from './create.ts';
import { getTaskProcedure } from './get.ts';
import { listTasksProcedure } from './list.ts';
import { moveTaskProcedure } from './move.ts';
import { onTaskCreatedProcedure } from './on-created.ts';
import { onTaskUpdatedProcedure } from './on-updated.ts';
import { updateTaskProcedure } from './update.ts';

export const taskRouter = createRouter({
    assign: assignTaskProcedure,
    create: createTaskProcedure,
    get: getTaskProcedure,
    list: listTasksProcedure,
    move: moveTaskProcedure,
    onCreated: onTaskCreatedProcedure,
    onUpdated: onTaskUpdatedProcedure,
    update: updateTaskProcedure,
});
