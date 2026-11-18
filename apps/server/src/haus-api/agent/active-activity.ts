import { agentActiveActivityInputSchema, agentActiveActivitySnapshotSchema } from '@haus/api';
import { readActiveAgentActivity } from '../../server-agents/agent-activity-history.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentActiveActivityProcedure = memberProcedure
    .input(agentActiveActivityInputSchema)
    .output(agentActiveActivitySnapshotSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        return await readActiveAgentActivity(ctx.hausDb, input.serverId);
    });
