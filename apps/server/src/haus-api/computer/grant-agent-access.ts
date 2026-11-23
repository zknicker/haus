import { computerAgentAccessInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    ComputerAgentAccessInvalidError,
    grantComputerAgentAccess,
} from '../../computers/computer-agent-access.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const grantAgentAccessProcedure = memberProcedure
    .input(computerAgentAccessInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const granted = await grantComputerAgentAccess(ctx.hausDb, ctx.member, input);
            computerUpdatedTopic.announce({
                computerId: granted.computerId,
                serverId: input.serverId,
            });
            return granted;
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (cause instanceof ComputerAgentAccessInvalidError) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            throw cause;
        }
    });
