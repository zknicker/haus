import { artifactTargetInputSchema } from '@haus/api';
import { deleteArtifact } from '../../artifacts/delete.ts';
import { artifactProcedure } from './procedure.ts';

export const deleteArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await deleteArtifact(ctx.hausDb, actor, ctx.artifactStorage, input.artifact_id);
    });
