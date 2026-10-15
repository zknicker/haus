import { artifactLibraryPageSchema, artifactListInputSchema } from '@haus/api';
import { listArtifactDrive } from '../../artifacts/list.ts';
import { artifactPublicLinks } from '../../artifacts/public-link.ts';
import { artifactProcedure } from './procedure.ts';

export const listArtifactProcedure = artifactProcedure
    .input(artifactListInputSchema)
    .output(artifactLibraryPageSchema)
    .query(async ({ ctx, input }) => {
        const { serverId, ...filters } = input;
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        const page = await listArtifactDrive(ctx.hausDb, actor, ctx.appOrigin, filters);
        const ids = page.artifacts.map((artifact) => artifact.artifact_id);
        return {
            ...page,
            public_links: await artifactPublicLinks(ctx.hausDb, actor, ctx.appOrigin, ids),
        };
    });
