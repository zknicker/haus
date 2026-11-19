import { workerCancelInputSchema, hasServerAdminAuthority } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publishRealtime } from '../../realtime/topic.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import {
    WorkerComputerRemovedError,
    WorkerNotFoundError,
    WorkerSettledError,
} from '../../workers/errors.ts';
import { requestWorkerCancel } from '../../workers/request-worker-cancel.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Owners and Admins cancel Worker from its card. The
 * request is recorded either way; an offline Computer applies it on reconnect,
 * and the Run settles through the ordinary observation path.
 */
export const cancelWorkerProcedure = memberProcedure
    .input(workerCancelInputSchema)
    .output(z.object({ cancelRequested: z.literal(true) }).strict())
    .mutation(async ({ ctx, input }) => {
        const membership = await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        if (!hasServerAdminAuthority(membership.role)) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Only Owners and Admins can cancel Worker.',
            });
        }
        if (!ctx.member) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Sign in to cancel this work.' });
        }
        try {
            const requested = await requestWorkerCancel(ctx.hausDb, {
                requestedBy: { id: ctx.member.id, kind: 'user' },
                serverId: input.serverId,
                workId: input.workId,
            });
            for (const event of requested.events) {
                publishRealtime(event);
            }
            for (const command of requested.commands) {
                ctx.computerConnections.send(requested.computerId, command);
            }
            return { cancelRequested: true } as const;
        } catch (cause) {
            if (cause instanceof WorkerNotFoundError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            if (cause instanceof WorkerComputerRemovedError) {
                throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
            }
            if (cause instanceof WorkerSettledError) {
                throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
            }
            throw cause;
        }
    });
