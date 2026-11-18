import { artifactRecordVersionsResultSchema, artifactTargetInputSchema } from '@haus/api';
import { listArtifactVersions } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const versionsArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .output(artifactRecordVersionsResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            versions: await listArtifactVersions(
                ctx.hausDb,
                actor,
                ctx.appOrigin,
                input.artifact_id,
                input.offset
            ),
        };
    });
