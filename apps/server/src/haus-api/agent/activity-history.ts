import { agentActivityHistoryInputSchema, agentActivityHistoryPageSchema } from '@haus/api';
import { listAgentActivityHistory } from '../../server-agents/agent-activity-history.ts';
import { readAgentRunTriggers } from '../../server-agents/read-agent-run-trigger.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentActivityHistoryProcedure = memberProcedure
    .input(agentActivityHistoryInputSchema)
    .output(agentActivityHistoryPageSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const page = await listAgentActivityHistory(ctx.hausDb, input);
        const runTriggers = await readAgentRunTriggers(ctx.hausDb, ctx.member, {
            agentId: input.agentId,
            runIds: page.events.map((event) => event.runId),
            serverId: input.serverId,
        });
        return { ...page, runTriggers };
    });
