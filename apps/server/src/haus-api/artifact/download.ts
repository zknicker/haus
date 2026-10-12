import { artifactDownloadResultSchema, artifactTargetInputSchema } from '@haus/api';
import { downloadArtifact } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const downloadArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .output(artifactDownloadResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await downloadArtifact(
            ctx.hausDb,
            actor,
            ctx.appOrigin,
            ctx.artifactStorage,
            input.artifact_id,
            input.revision_id
        );
    });
