import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { removeServerComputer } from '../../computers/remove-computer.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { memberProcedure } from '../server/procedure.ts';

export const removeComputerProcedure = memberProcedure
    .input(
        z
            .object({
                computerId: z.string().min(1),
                confirmation: z.string().trim(),
                serverId: serverIdSchema,
            })
            .strict()
    )
    .mutation(async ({ ctx, input }) => {
        try {
            const removed = await removeServerComputer(ctx.hausDb, ctx.member, input);
            ctx.computerConnections.disconnectComputer(removed.computerId);
            computerUpdatedTopic.announce({
                computerId: input.computerId,
                serverId: input.serverId,
            });
            return removed;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw new TRPCError({
                cause,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Computer could not be removed. Try again.',
            });
        }
    });
