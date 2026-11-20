import { artifactByPathInputSchema, artifactRecordResultSchema } from '@haus/api';
import { getArtifactRecordAtPath } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const byPathArtifactProcedure = artifactProcedure
    .input(artifactByPathInputSchema)
    .output(artifactRecordResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifact: await getArtifactRecordAtPath(
                ctx.hausDb,
                actor,
                ctx.appOrigin,
                input.path,
                input.revision_id
            ),
        };
    });
