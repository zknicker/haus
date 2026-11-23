import { computerSetAgentAccessScopeInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { setAgentAccessScope } from '../../computers/set-agent-access-scope.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const setAgentAccessScopeProcedure = memberProcedure
    .input(computerSetAgentAccessScopeInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const set = await setAgentAccessScope(ctx.hausDb, ctx.member, input);
            for (const agent of set.barred) {
                ctx.invocations.fenceAgent({ ...agent, computerId: set.computerId });
            }
            computerUpdatedTopic.announce({ computerId: set.computerId, serverId: input.serverId });
            return { computerId: set.computerId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
