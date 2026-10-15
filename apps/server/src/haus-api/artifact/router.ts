import { createRouter } from '../trpc.ts';
import { creatorsArtifactProcedure } from './creators.ts';
import { deleteArtifactProcedure } from './delete.ts';
import { deleteVersionArtifactProcedure } from './delete-version.ts';
import { downloadArtifactProcedure } from './download.ts';
import { getArtifactProcedure } from './get.ts';
import { listArtifactProcedure } from './list.ts';
import { moveArtifactProcedure } from './move.ts';
import { onArtifactUpdatedProcedure } from './on-updated.ts';
import { publicLinkArtifactProcedure } from './public-link.ts';
import { restoreArtifactProcedure } from './restore.ts';
import { shareArtifactProcedure } from './share.ts';
import { textArtifactProcedure } from './text.ts';
import { thumbnailArtifactProcedure } from './thumbnail.ts';
import { unshareArtifactProcedure } from './unshare.ts';
import { versionsArtifactProcedure } from './versions.ts';
export const artifactRouter = createRouter({
    list: listArtifactProcedure,
    creators: creatorsArtifactProcedure,
    get: getArtifactProcedure,
    versions: versionsArtifactProcedure,
    download: downloadArtifactProcedure,
    text: textArtifactProcedure,
    thumbnail: thumbnailArtifactProcedure,
    move: moveArtifactProcedure,
    delete: deleteArtifactProcedure,
    deleteVersion: deleteVersionArtifactProcedure,
    restore: restoreArtifactProcedure,
    publicLink: publicLinkArtifactProcedure,
    share: shareArtifactProcedure,
    unshare: unshareArtifactProcedure,
    onUpdated: onArtifactUpdatedProcedure,
});
