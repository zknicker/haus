import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { checkServerComputerPresence } from '../../computers/check-presence.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Probes the Server's attached Computers now and returns the verified Computer list. */
export const checkComputerPresenceProcedure = memberProcedure
    .input(z.object({ serverId: serverIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            return await checkServerComputerPresence(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member,
                input.serverId
            );
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
