import { computerUseDecideInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { announceComputerUseRequest } from '../../computer-use/computer-use-events.ts';
import {
    ComputerUseRequestDecidedError,
    ComputerUseRequestMissingError,
    decideComputerUse,
} from '../../computer-use/decide-computer-use.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const decideComputerUseProcedure = memberProcedure
    .input(computerUseDecideInputSchema)
    .output(z.object({ requestId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const decided = await decideComputerUse(
                ctx.hausDb,
                ctx.agentDelivery,
                ctx.member,
                input
            );
            announceComputerUseRequest(decided);
            if (decided.standing) {
                computerUpdatedTopic.announce({
                    computerId: decided.computerId,
                    serverId: decided.serverId,
                });
            }
            await ctx.postCommitWork.wakeAgents(ctx.agentDelivery, [decided]);
            return { requestId: decided.requestId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (cause instanceof ComputerUseRequestDecidedError) {
                throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
            }
            if (cause instanceof ComputerUseRequestMissingError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
