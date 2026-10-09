import { cloudAgentWorkCancelInputSchema, hasServerAdminAuthority } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    CloudAgentWorkNotFoundError,
    CloudAgentWorkSettledError,
} from '../../cloud-agents/errors.ts';
import { requestCloudAgentCancel } from '../../cloud-agents/request-cloud-agent-cancel.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Owners and Admins cancel Cloud Agent work from the Thread surface. The
 * request is recorded either way; an offline Computer applies it on reconnect,
 * and the Run settles through the ordinary observation path.
 */
export const cancelCloudAgentWorkProcedure = memberProcedure
    .input(cloudAgentWorkCancelInputSchema)
    .output(z.object({ cancelRequested: z.literal(true) }).strict())
    .mutation(async ({ ctx, input }) => {
        const membership = await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        if (!hasServerAdminAuthority(membership.role)) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Only Owners and Admins can cancel Cloud Agent work.',
            });
        }
        if (!ctx.member) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Sign in to cancel this work.' });
        }
        try {
            const requested = await requestCloudAgentCancel(ctx.hausDb, {
                requestedBy: { id: ctx.member.id, kind: 'user' },
                serverId: input.serverId,
                workId: input.workId,
            });
            publishRealtime(requested.event);
            ctx.computerConnections.send(requested.computerId, requested.command);
            return { cancelRequested: true } as const;
        } catch (cause) {
            if (cause instanceof CloudAgentWorkNotFoundError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            if (cause instanceof CloudAgentWorkSettledError) {
                throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
            }
            throw cause;
        }
    });
