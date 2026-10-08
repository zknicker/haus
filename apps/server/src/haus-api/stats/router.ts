import { createRouter } from '../trpc.ts';
import { agentUsageProcedure } from './agent-usage.ts';
import { getUsageProcedure } from './live.ts';

export const statsRouter = createRouter({
    agentUsage: agentUsageProcedure,
    live: getUsageProcedure,
});
