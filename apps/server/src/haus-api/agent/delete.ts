import { deleteAgentInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { publishRealtime } from '../../realtime/topic.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentDeleteDeniedError } from '../../server-agents/agent-config-errors.ts';
import { deleteAgent } from '../../server-agents/delete-agent.ts';
import { memberProcedure } from '../server/procedure.ts';

export const deleteAgentProcedure = memberProcedure
    .input(deleteAgentInputSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const result = await deleteAgent(ctx.hausDb, ctx.member, input);
            for (const event of result.taskEvents) {
                publishRealtime(event);
            }
            ctx.agentDelivery.retireAgent({
                agentId: result.agentId,
                computerId: result.computerId,
            });
            agentUpdatedTopic.announce({
                agentId: result.agentId,
                serverId: input.serverId,
            });
            return { agentId: result.agentId };
        } catch (cause) {
            if (cause instanceof AgentDeleteDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
