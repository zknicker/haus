import { computerAgentAccessInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { revokeComputerAgentAccess } from '../../computers/computer-agent-access.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

export const revokeAgentAccessProcedure = memberProcedure
    .input(computerAgentAccessInputSchema)
    .output(z.object({ computerId: z.string() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const revoked = await revokeComputerAgentAccess(ctx.hausDb, ctx.member, input);
            if (revoked.barred) {
                ctx.invocations.fenceAgent({
                    agentId: input.agentId,
                    computerId: revoked.computerId,
                    serverId: input.serverId,
                });
            }
            computerUpdatedTopic.announce({
                computerId: revoked.computerId,
                serverId: input.serverId,
            });
            return { computerId: revoked.computerId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
