import { driveChangesInputSchema, driveChangesResultSchema } from '@haus/api';
import { readDriveChanges } from '../../drive/changes-query.ts';
import { artifactProcedure } from '../artifact/procedure.ts';

export const changesDriveProcedure = artifactProcedure
    .input(driveChangesInputSchema)
    .output(driveChangesResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await readDriveChanges(ctx.hausDb, actor, input);
    });
