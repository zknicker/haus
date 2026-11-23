import { createRouter } from '../trpc.ts';
import { createProjectProcedure } from './create.ts';
import { listProjectsProcedure } from './list.ts';
import { onProjectUpdatedProcedure } from './on-updated.ts';
import { setProjectDefaultWorkerPlaceProcedure } from './set-default-worker-place.ts';
import { updateProjectProcedure } from './update.ts';

export const projectRouter = createRouter({
    create: createProjectProcedure,
    list: listProjectsProcedure,
    onUpdated: onProjectUpdatedProcedure,
    setDefaultWorkerPlace: setProjectDefaultWorkerPlaceProcedure,
    update: updateProjectProcedure,
});
