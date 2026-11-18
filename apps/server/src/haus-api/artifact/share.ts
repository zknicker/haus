import { artifactPublicLinkInputSchema, artifactPublicLinkResultSchema } from '@haus/api';
import { shareArtifact } from '../../artifacts/public-link.ts';
import { artifactProcedure } from './procedure.ts';

/** Creates the file's public link, or returns the live one. */
export const shareArtifactProcedure = artifactProcedure
    .input(artifactPublicLinkInputSchema)
    .output(artifactPublicLinkResultSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifact_id: input.artifact_id,
            link: await shareArtifact(ctx.hausDb, actor, ctx.appOrigin, input.artifact_id),
        };
    });
