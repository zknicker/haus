import { deleteAgentInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { readServerComputerIds } from '../../computers/agent-retirement.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentDeleteDeniedError } from '../../server-agents/agent-config-errors.ts';
import { deleteAgent } from '../../server-agents/delete-agent.ts';
import { announceTaskSessions } from '../../tasks/task-session.ts';
import { memberProcedure } from '../server/procedure.ts';

export const deleteAgentProcedure = memberProcedure
    .input(deleteAgentInputSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const result = await deleteAgent(ctx.hausDb, ctx.member, input, ctx.agentDelivery);
            for (const event of result.claimEvents) {
                publishRealtime(event);
            }
            publishRealtime(result.taskEvents);
            publishRealtime(result.crew.events);
            announceTaskSessions(
                { invocations: ctx.invocations, runner: ctx.runnerLink },
                result.crew.sessions
            );
            void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.crew.wakes);
            for (const computerId of await readServerComputerIds(ctx.hausDb, input.serverId)) {
                ctx.invocations.fenceAgent({
                    agentId: result.agentId,
                    computerId,
                    serverId: input.serverId,
                });
            }
            await ctx.agentDelivery.retireAgent({
                agentId: result.agentId,
                serverId: input.serverId,
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
