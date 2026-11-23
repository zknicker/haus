import { agentMachineInputSchema, agentMachineSchema, agentSetMachineInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { readMachineState } from '../../agent-machine/machine-change-read.ts';
import { requestMachineChange } from '../../agent-machine/request-machine-change.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentMachineProcedure = memberProcedure
    .input(agentMachineInputSchema)
    .output(agentMachineSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readMachineState(ctx.hausDb, ctx.member, input, (computerId) =>
                ctx.computerConnections.isOnline(computerId)
            );
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });

export const setAgentMachineProcedure = memberProcedure
    .input(agentSetMachineInputSchema)
    .output(agentMachineSchema)
    .mutation(async ({ ctx, input }) => {
        const isOnline = (computerId: string) => ctx.computerConnections.isOnline(computerId);
        try {
            await requestMachineChange(ctx.hausDb, ctx.member, input, isOnline);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
        await ctx.agentDelivery.advanceMachineChange(input.agentId);
        await ctx.agentDelivery.dispatchAgent(input.agentId, input.serverId);
        return await readMachineState(ctx.hausDb, ctx.member, input, isOnline);
    });
