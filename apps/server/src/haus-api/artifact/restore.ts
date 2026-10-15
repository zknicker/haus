import { artifactRecordResultSchema, artifactRestoreInputSchema } from '@haus/api';
import { restoreArtifactRevision } from '../../artifacts/restore.ts';
import { artifactProcedure } from './procedure.ts';

/** Publishes an older revision's bytes as the file's new current revision. */
export const restoreArtifactProcedure = artifactProcedure
    .input(artifactRestoreInputSchema)
    .output(artifactRecordResultSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifact: await restoreArtifactRevision({
                actor,
                artifactId: input.artifact_id,
                budget: ctx.artifactStorageBytes,
                db: ctx.hausDb,
                origin: ctx.appOrigin,
                revisionId: input.revision_id,
                storage: ctx.artifactStorage,
                thumbnails: ctx.artifactThumbnails,
            }),
        };
    });
