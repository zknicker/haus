import { artifactDeleteManyInputSchema, artifactDeleteManyResultSchema } from '@haus/api';
import { deleteManyArtifacts } from '../../artifacts/delete-many.ts';
import { artifactProcedure } from './procedure.ts';

export const deleteManyArtifactProcedure = artifactProcedure
    .input(artifactDeleteManyInputSchema)
    .output(artifactDeleteManyResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { serverId, ...selection } = input;
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        return await deleteManyArtifacts(ctx.hausDb, actor, ctx.artifactStorage, selection);
    });
