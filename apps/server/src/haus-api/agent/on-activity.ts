import { agentActivityEventSchema, agentActivitySubscriptionInputSchema } from '@haus/api';
import { subscribeToCommittedAgentActivity } from '../../agent-delivery/activity-events.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const onAgentActivityProcedure = memberProcedure
    .input(agentActivitySubscriptionInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToCommittedAgentActivity(signal)) {
            if (event.serverId !== input.serverId) {
                continue;
            }
            await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
            yield agentActivityEventSchema.parse(event);
        }
    });
