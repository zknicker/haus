import { agentCreatedSchema, createAgentInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AvatarRejectedError } from '../../avatars/avatar-errors.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { createAgent } from '../../server-agents/create-agent.ts';
import { memberProcedure } from '../server/procedure.ts';

export const createAgentProcedure = memberProcedure
    .input(createAgentInputSchema)
    .output(agentCreatedSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const { event, ...created } = await createAgent(ctx.hausDb, ctx.member, input);
            if (event) {
                // The new Agent is in #all now, so that channel's member list moved.
                publishRealtime(event);
            }
            await ctx.agentDelivery.configureAgent({
                agentDescription: created.agent.description,
                agentId: created.agent.id,
                agentName: created.agent.displayName,
                computerId: created.agent.computerId,
                modelId: created.agent.desiredModelId,
                reasoningEffort: created.agent.desiredReasoningEffort,
                runtimeId: created.agent.desiredRuntimeId,
            });
            agentUpdatedTopic.announce({
                agentId: created.agent.id,
                serverId: input.serverId,
            });
            return created;
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (cause instanceof AvatarRejectedError) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            throw cause;
        }
    });
