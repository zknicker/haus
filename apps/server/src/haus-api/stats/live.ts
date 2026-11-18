import { serverStatsInputSchema, serverUsageOverviewSchema } from '@haus/api';
import { readServerUsage } from '../../server-operations/computer-usage.ts';
import { memberProcedure } from '../server/procedure.ts';

export const getUsageProcedure = memberProcedure
    .input(serverStatsInputSchema)
    .output(serverUsageOverviewSchema)
    .query(({ ctx, input }) => readServerUsage(ctx.hausDb, ctx.member, input.serverId));
