import { artifactZipInputSchema, artifactZipResultSchema } from '@haus/api';
import { artifactAccess } from '../../artifacts/access.ts';
import { requireArtifactStorage } from '../../artifacts/storage.ts';
import { planArtifactZip } from '../../artifacts/zip-plan.ts';
import { artifactZipTickets } from '../../artifacts/zip-tickets.ts';
import { artifactProcedure } from './procedure.ts';

/**
 * Plans a zip of a selection (refusing it past the caps before any bytes move) and issues the
 * short-lived link that streams it (`GET /artifacts/zip/:token`).
 */
export const zipArtifactProcedure = artifactProcedure
    .input(artifactZipInputSchema)
    .output(artifactZipResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { serverId, ...selection } = input;
        requireArtifactStorage(ctx.artifactStorage);
        const actor = { kind: 'human', member: ctx.member, serverId } as const;
        const plan = await planArtifactZip(
            ctx.hausDb,
            await artifactAccess(ctx.hausDb, actor),
            selection
        );
        const link = artifactZipTickets.issue(actor, selection);
        return {
            expires_at: link.expiresAt.toISOString(),
            file_count: plan.entries.length,
            filename: plan.filename,
            total_bytes: plan.totalBytes,
            zip_path: `/artifacts/zip/${link.token}`,
        };
    });
