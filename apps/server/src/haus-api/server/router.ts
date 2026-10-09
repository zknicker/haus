import { createRouter } from '../trpc.ts';
import { serverBySlugProcedure } from './by-slug.ts';
import { createServerProcedure } from './create.ts';
import { createCoveProcedure } from './create-cove.ts';
import { deleteServerProcedure, serverDeletionStatusProcedure } from './delete.ts';
import { developmentBootstrapProcedure } from './development-bootstrap.ts';
import { listServersProcedure } from './list.ts';
import { onServerUpdatedProcedure } from './on-updated.ts';
import { renameServerProcedure } from './rename.ts';

export const serverRouter = createRouter({
    bySlug: serverBySlugProcedure,
    createCove: createCoveProcedure,
    create: createServerProcedure,
    delete: deleteServerProcedure,
    developmentBootstrap: developmentBootstrapProcedure,
    deletionStatus: serverDeletionStatusProcedure,
    list: listServersProcedure,
    onUpdated: onServerUpdatedProcedure,
    rename: renameServerProcedure,
});
