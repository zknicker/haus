import { artifactListInputSchema, artifactListResultSchema } from '@haus/api';
import { listArtifactDrive } from '../../artifacts/list.ts';
import { artifactProcedure } from './procedure.ts';

export const listArtifactProcedure = artifactProcedure
    .input(artifactListInputSchema)
    .output(artifactListResultSchema)
    .query(async ({ ctx, input }) => {
        const { serverId, ...filters } = input;
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        return await listArtifactDrive(ctx.hausDb, actor, ctx.appOrigin, filters);
    });
