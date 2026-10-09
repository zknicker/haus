import { agentSchema, configureAgentInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { configureAgent } from '../../server-agents/configure-agent.ts';
import { memberProcedure } from '../server/procedure.ts';

export const configureAgentProcedure = memberProcedure
    .input(configureAgentInputSchema)
    .output(agentSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const result = await configureAgent(ctx.hausDb, ctx.member, input);
            await ctx.agentDelivery.applyAgentConfiguration({
                agent: result.agent,
                rotation: result.rotation,
            });
            agentUpdatedTopic.announce({
                agentId: result.agent.id,
                serverId: input.serverId,
            });
            return result.agent;
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
