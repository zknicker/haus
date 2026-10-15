import { artifactPublicLinkInputSchema, artifactPublicLinkResultSchema } from '@haus/api';
import { unshareArtifact } from '../../artifacts/public-link.ts';
import { artifactProcedure } from './procedure.ts';

/** Disables the file's public link; its token answers 404 from now on. */
export const unshareArtifactProcedure = artifactProcedure
    .input(artifactPublicLinkInputSchema)
    .output(artifactPublicLinkResultSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        await unshareArtifact(ctx.hausDb, actor, input.artifact_id);
        return { artifact_id: input.artifact_id, link: null };
    });
