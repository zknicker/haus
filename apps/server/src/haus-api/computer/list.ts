import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ComputerSetupDeniedError, listServerComputers } from '../../computers/service.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { memberProcedure } from '../server/procedure.ts';

export const listComputersProcedure = memberProcedure
    .input(z.object({ serverId: serverIdSchema }).strict())
    .query(async ({ ctx, input }) => {
        try {
            return await listServerComputers(
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
