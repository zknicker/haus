import { agentExecutionOutlinesInputSchema, agentExecutionOutlinesSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    AgentExecutionJournalAccessError,
    requestAgentExecutionOutlines,
} from '../../server-agents/agent-execution-journal.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentExecutionOutlinesProcedure = memberProcedure
    .input(agentExecutionOutlinesInputSchema)
    .output(agentExecutionOutlinesSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await requestAgentExecutionOutlines(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member,
                input
            );
        } catch (cause) {
            if (cause instanceof AgentExecutionJournalAccessError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
