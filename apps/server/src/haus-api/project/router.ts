import { createRouter } from '../trpc.ts';
import { addProjectRepoProcedure } from './add-repo.ts';
import { createProjectProcedure } from './create.ts';
import { linkProjectRepoProcedure, unlinkProjectRepoProcedure } from './link-repo.ts';
import { listProjectsProcedure } from './list.ts';
import { onProjectUpdatedProcedure } from './on-updated.ts';
import { removeProjectRepoProcedure } from './remove-repo.ts';
import { setProjectDefaultWorkerPlaceProcedure } from './set-default-worker-place.ts';
import { updateProjectProcedure } from './update.ts';

export const projectRouter = createRouter({
    addRepo: addProjectRepoProcedure,
    create: createProjectProcedure,
    linkRepo: linkProjectRepoProcedure,
    list: listProjectsProcedure,
    onUpdated: onProjectUpdatedProcedure,
    removeRepo: removeProjectRepoProcedure,
    setDefaultWorkerPlace: setProjectDefaultWorkerPlaceProcedure,
    unlinkRepo: unlinkProjectRepoProcedure,
    update: updateProjectProcedure,
});
