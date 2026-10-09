import { agentSchema, updateAgentProfileInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { AgentDescriptionTooLongError } from '../../server-agents/errors.ts';
import { updateAgentProfile } from '../../server-agents/update-agent-profile.ts';
import { memberProcedure } from '../server/procedure.ts';

export const updateAgentProfileProcedure = memberProcedure
    .input(updateAgentProfileInputSchema)
    .output(agentSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const agent = await updateAgentProfile(ctx.hausDb, ctx.member, input);
            await ctx.agentDelivery.configureAgent({
                agentDescription: agent.description,
                agentId: agent.id,
                agentName: agent.displayName,
                computerId: agent.computerId,
                modelId: agent.desiredModelId,
                reasoningEffort: agent.desiredReasoningEffort,
                runtimeId: agent.desiredRuntimeId,
            });
            agentUpdatedTopic.announce({ agentId: agent.id, serverId: input.serverId });
            return agent;
        } catch (cause) {
            if (cause instanceof AgentDescriptionTooLongError) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
