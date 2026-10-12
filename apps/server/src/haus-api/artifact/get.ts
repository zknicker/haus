import { artifactPublishResultSchema, artifactTargetInputSchema } from '@haus/api';
import { getArtifact } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const getArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .output(artifactPublishResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifact: (
                await getArtifact(
                    ctx.hausDb,
                    actor,
                    ctx.appOrigin,
                    input.artifact_id,
                    input.revision_id
                )
            ).metadata,
        };
    });
