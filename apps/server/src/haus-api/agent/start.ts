import { agentDeliveryControlInputSchema, agentDeliveryStateSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import {
    assertAgentDeliveryAccess,
    readAgentDeliveryState,
} from '../../server-agents/agent-delivery-control.ts';
import { memberProcedure } from '../server/procedure.ts';

export const startAgentProcedure = memberProcedure
    .input(agentDeliveryControlInputSchema)
    .output(agentDeliveryStateSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            await assertAgentDeliveryAccess(ctx.hausDb, ctx.member, input);
            await ctx.agentDelivery.start(input);
            agentUpdatedTopic.announce({
                agentId: input.agentId,
                serverId: input.serverId,
            });
            return await readAgentDeliveryState(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
