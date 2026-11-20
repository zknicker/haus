import { artifactTargetInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { deleteArtifactVersion } from '../../artifacts/delete.ts';
import { artifactProcedure } from './procedure.ts';

export const deleteVersionArtifactProcedure = artifactProcedure
    .input(artifactTargetInputSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        if (!input.revision_id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'revision_id is required.' });
        }
        return await deleteArtifactVersion(
            ctx.hausDb,
            actor,
            ctx.artifactStorage,
            input.artifact_id,
            input.revision_id
        );
    });
