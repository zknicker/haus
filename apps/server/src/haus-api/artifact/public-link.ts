import { artifactPublicLinkInputSchema, artifactPublicLinkResultSchema } from '@haus/api';
import { artifactPublicLink } from '../../artifacts/public-link.ts';
import { artifactProcedure } from './procedure.ts';

export const publicLinkArtifactProcedure = artifactProcedure
    .input(artifactPublicLinkInputSchema)
    .output(artifactPublicLinkResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return {
            artifact_id: input.artifact_id,
            link: await artifactPublicLink(ctx.hausDb, actor, ctx.appOrigin, input.artifact_id),
        };
    });
