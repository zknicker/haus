import { artifactTextInputSchema, artifactTextResultSchema } from '@haus/api';
import { readArtifactText } from '../../artifacts/text.ts';
import { artifactProcedure } from './procedure.ts';

export const textArtifactProcedure = artifactProcedure
    .input(artifactTextInputSchema)
    .output(artifactTextResultSchema)
    .query(async ({ ctx, input }) => {
        const actor = { kind: 'human', member: ctx.member, serverId: input.serverId } as const;
        return await readArtifactText(
            ctx.hausDb,
            actor,
            ctx.appOrigin,
            ctx.artifactStorage,
            input.artifact_id,
            input.revision_id
        );
    });
