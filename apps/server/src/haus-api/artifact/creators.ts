import { artifactCreatorsInputSchema, artifactCreatorsResultSchema } from '@haus/api';
import { listArtifactCreators } from '../../artifacts/creators.ts';
import { artifactProcedure } from './procedure.ts';

export const creatorsArtifactProcedure = artifactProcedure
    .input(artifactCreatorsInputSchema)
    .output(artifactCreatorsResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return { creators: await listArtifactCreators(ctx.hausDb, actor, ctx.appOrigin) };
    });
