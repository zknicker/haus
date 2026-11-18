import { artifactThumbnailInputSchema, artifactThumbnailResultSchema } from '@haus/api';
import { artifactThumbnail } from '../../artifacts/thumbnail-read.ts';
import { artifactProcedure } from './procedure.ts';

export const thumbnailArtifactProcedure = artifactProcedure
    .input(artifactThumbnailInputSchema)
    .output(artifactThumbnailResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await artifactThumbnail(
            ctx.hausDb,
            actor,
            ctx.appOrigin,
            ctx.artifactStorage,
            ctx.artifactThumbnails,
            input.artifact_id,
            input.revision_id
        );
    });
