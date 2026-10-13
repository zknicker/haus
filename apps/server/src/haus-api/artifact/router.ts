import { createRouter } from '../trpc.ts';
import { creatorsArtifactProcedure } from './creators.ts';
import { deleteArtifactProcedure } from './delete.ts';
import { deleteVersionArtifactProcedure } from './delete-version.ts';
import { downloadArtifactProcedure } from './download.ts';
import { getArtifactProcedure } from './get.ts';
import { listArtifactProcedure } from './list.ts';
import { textArtifactProcedure } from './text.ts';
import { versionsArtifactProcedure } from './versions.ts';
export const artifactRouter = createRouter({
    list: listArtifactProcedure,
    creators: creatorsArtifactProcedure,
    get: getArtifactProcedure,
    versions: versionsArtifactProcedure,
    download: downloadArtifactProcedure,
    text: textArtifactProcedure,
    delete: deleteArtifactProcedure,
    deleteVersion: deleteVersionArtifactProcedure,
});
