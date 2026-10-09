import { createRouter } from '../trpc.ts';
import { createTaskLabelProcedure } from './create.ts';
import { deleteTaskLabelProcedure } from './delete.ts';
import { listTaskLabelsProcedure } from './list.ts';
import { onTaskLabelUpdatedProcedure } from './on-updated.ts';
import { updateTaskLabelProcedure } from './update.ts';

export const taskLabelRouter = createRouter({
    create: createTaskLabelProcedure,
    delete: deleteTaskLabelProcedure,
    list: listTaskLabelsProcedure,
    onUpdated: onTaskLabelUpdatedProcedure,
    update: updateTaskLabelProcedure,
});
