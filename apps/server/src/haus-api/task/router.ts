import { createRouter } from '../trpc.ts';
import { assignTaskProcedure } from './assign.ts';
import { getTaskProcedure } from './get.ts';
import { listTasksProcedure } from './list.ts';
import { listOpenTasksProcedure } from './list-open.ts';
import { onTaskCreatedProcedure } from './on-created.ts';
import { onTaskFollowUpdatedProcedure } from './on-follow-updated.ts';
import { onTaskUpdatedProcedure } from './on-updated.ts';
import { setTaskFollowProcedure } from './set-follow.ts';
import { setTaskStateProcedure } from './set-state.ts';
import { updateTaskProcedure } from './update.ts';

export const taskRouter = createRouter({
    assign: assignTaskProcedure,
    get: getTaskProcedure,
    list: listTasksProcedure,
    listOpen: listOpenTasksProcedure,
    onCreated: onTaskCreatedProcedure,
    onFollowUpdated: onTaskFollowUpdatedProcedure,
    onUpdated: onTaskUpdatedProcedure,
    setFollow: setTaskFollowProcedure,
    setState: setTaskStateProcedure,
    update: updateTaskProcedure,
});
