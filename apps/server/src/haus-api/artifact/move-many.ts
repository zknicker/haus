import { artifactMoveManyInputSchema, artifactMoveManyResultSchema } from '@haus/api';
import { moveManyArtifacts } from '../../artifacts/move-many.ts';
import { artifactProcedure } from './procedure.ts';

export const moveManyArtifactProcedure = artifactProcedure
    .input(artifactMoveManyInputSchema)
    .output(artifactMoveManyResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { serverId, ...move } = input;
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        return await moveManyArtifacts(ctx.hausDb, actor, ctx.appOrigin, move);
    });
