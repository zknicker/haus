import { computerSetComputerUseInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { setComputerUse } from '../../computers/set-computer-use.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const setComputerUseProcedure = memberProcedure
    .input(computerSetComputerUseInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const set = await setComputerUse(ctx.hausDb, ctx.member, input);
            computerUpdatedTopic.announce({ computerId: set.computerId, serverId: input.serverId });
            return set;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
