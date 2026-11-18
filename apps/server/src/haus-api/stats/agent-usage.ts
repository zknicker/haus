import { agentUsageInputSchema, tokenUsageOverviewSchema } from '@haus/api';
import { readAgentTokenUsage } from '../../server-operations/computer-usage.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentUsageProcedure = memberProcedure
    .input(agentUsageInputSchema)
    .output(tokenUsageOverviewSchema)
    .query(({ ctx, input }) => readAgentTokenUsage(ctx.hausDb, ctx.member, input));
