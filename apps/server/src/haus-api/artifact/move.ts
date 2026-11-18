import { artifactMoveInputSchema, artifactMoveResultSchema } from '@haus/api';
import { moveArtifacts } from '../../artifacts/move.ts';
import { artifactProcedure } from './procedure.ts';

export const moveArtifactProcedure = artifactProcedure
    .input(artifactMoveInputSchema)
    .output(artifactMoveResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { serverId, ...move } = input;
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        return await moveArtifacts(ctx.hausDb, actor, ctx.appOrigin, move);
    });
