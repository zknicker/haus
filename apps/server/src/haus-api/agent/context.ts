import { agentContextInputSchema, agentContextSchema } from '@haus/api';
import { readAgentContext } from '../../server-agents/agent-context.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentContextProcedure = memberProcedure
    .input(agentContextInputSchema)
    .output(agentContextSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        return { snapshot: await readAgentContext(ctx.hausDb, input) };
    });
