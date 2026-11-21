import { computerSetComputerUseAgentsInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import {
    ComputerUseAgentsInvalidError,
    setComputerUseAgents,
} from '../../computers/set-computer-use-agents.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const setComputerUseAgentsProcedure = memberProcedure
    .input(computerSetComputerUseAgentsInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const set = await setComputerUseAgents(ctx.hausDb, ctx.member, input);
            computerUpdatedTopic.announce({ computerId: set.computerId, serverId: input.serverId });
            return set;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (cause instanceof ComputerUseAgentsInvalidError) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            throw cause;
        }
    });
