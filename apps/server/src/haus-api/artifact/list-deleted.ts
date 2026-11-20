import { artifactListDeletedInputSchema, artifactListDeletedResultSchema } from '@haus/api';
import { listDeletedArtifacts } from '../../artifacts/list-deleted.ts';
import { artifactProcedure } from './procedure.ts';

export const listDeletedArtifactProcedure = artifactProcedure
    .input(artifactListDeletedInputSchema)
    .output(artifactListDeletedResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await listDeletedArtifacts(ctx.hausDb, actor, ctx.appOrigin, input);
    });
