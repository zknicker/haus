import { artifactListInputSchema, artifactListResultSchema } from '@haus/api';
import { listArtifacts } from '../../artifacts/read.ts';
import { artifactProcedure } from './procedure.ts';

export const listArtifactProcedure = artifactProcedure
    .input(artifactListInputSchema)
    .output(artifactListResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifacts: await listArtifacts(
                ctx.hausDb,
                actor,
                ctx.appOrigin,
                input.offset,
                undefined,
                input
            ),
        };
    });
