import { hostSkillFileInputSchema, hostSkillFileSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import {
    HostSkillFileFailedError,
    HostSkillFileUnavailableError,
} from '../../computers/host-skill-file-replies.ts';
import { computersTable } from '../../postgres/schema.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Reads a host-installed skill's `SKILL.md` live from its Computer; nothing is stored. */
export const computerSkillFileProcedure = memberProcedure
    .input(hostSkillFileInputSchema)
    .output(hostSkillFileSchema)
    .query(async ({ ctx, input }) => {
        const membership = await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        if (membership.role !== 'owner' && membership.role !== 'admin') {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Only a Server Owner or Admin can read a host skill.',
            });
        }
        const [computer] = await ctx.hausDb
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(
                and(
                    eq(computersTable.id, input.computerId),
                    eq(computersTable.serverId, input.serverId)
                )
            )
            .limit(1);
        if (!computer) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'That Computer is not attached to this Server.',
            });
        }
        try {
            return {
                content: await ctx.computerConnections.hostSkillFiles.request(
                    computer.id,
                    input.sourceId
                ),
            };
        } catch (cause) {
            throw hostSkillFileError(cause);
        }
    });

function hostSkillFileError(cause: unknown) {
    if (cause instanceof HostSkillFileFailedError) {
        return new TRPCError({
            cause,
            code: cause.reason === 'not-found' ? 'NOT_FOUND' : 'UNPROCESSABLE_CONTENT',
            message: cause.message,
        });
    }
    if (cause instanceof HostSkillFileUnavailableError) {
        return new TRPCError({ cause, code: 'SERVICE_UNAVAILABLE', message: cause.message });
    }
    return cause;
}
