import { artifactTargetInputSchema, artifactVersionsResultSchema } from '@haus/api';
import { listArtifacts } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const versionsArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .output(artifactVersionsResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            versions: await listArtifacts(
                ctx.hausDb,
                actor,
                ctx.appOrigin,
                input.offset,
                input.artifact_id
            ),
        };
    });
