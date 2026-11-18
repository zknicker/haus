import { artifactTargetInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { deleteArtifact } from '../../artifacts/delete.ts';
import { artifactProcedure } from './procedure.ts';

export const deleteVersionArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        if (!input.revision_id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'revision_id is required.' });
        }
        return await deleteArtifact(
            ctx.hausDb,
            actor,
            ctx.artifactStorage,
            input.artifact_id,
            input.revision_id
        );
    });
