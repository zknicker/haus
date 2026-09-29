import { createRouter } from '../trpc.ts';
import { assignTaskProcedure } from './assign.ts';
import { taskAssigneesProcedure } from './assignees.ts';
import { createTaskProcedure } from './create.ts';
import { listTasksProcedure } from './list.ts';
import { promoteTaskProcedure } from './promote.ts';
import { updateTaskProcedure } from './update.ts';

export const taskRouter = createRouter({
    assign: assignTaskProcedure,
    assignees: taskAssigneesProcedure,
    create: createTaskProcedure,
    list: listTasksProcedure,
    promote: promoteTaskProcedure,
    update: updateTaskProcedure,
});
