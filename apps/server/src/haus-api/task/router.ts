import { createRouter } from '../trpc.ts';
import { archiveTaskProcedure } from './archive.ts';
import { createTaskProcedure } from './create.ts';
import { getTaskProcedure } from './get.ts';
import { listActiveTasksProcedure } from './list-active.ts';
import { listTasksProcedure } from './list.ts';
import { onTaskCreatedProcedure } from './on-created.ts';
import { onTaskFollowUpdatedProcedure } from './on-follow-updated.ts';
import { onTaskUpdatedProcedure } from './on-updated.ts';
import { setTaskFollowProcedure } from './set-follow.ts';
import { startTaskProcedure } from './start.ts';
import { unarchiveTaskProcedure } from './unarchive.ts';
import { updateTaskProcedure } from './update.ts';

export const taskRouter = createRouter({
    archive: archiveTaskProcedure,
    create: createTaskProcedure,
    get: getTaskProcedure,
    list: listTasksProcedure,
    listActive: listActiveTasksProcedure,
    onCreated: onTaskCreatedProcedure,
    onFollowUpdated: onTaskFollowUpdatedProcedure,
    onUpdated: onTaskUpdatedProcedure,
    setFollow: setTaskFollowProcedure,
    start: startTaskProcedure,
    unarchive: unarchiveTaskProcedure,
    update: updateTaskProcedure,
});
