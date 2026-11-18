import { agentLifecycleEventSchema, agentLifecycleSubscriptionInputSchema } from '@haus/api';
import { subscribeToAgentLifecycle } from '../../agent-delivery/lifecycle.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const onAgentLifecycleProcedure = memberProcedure
    .input(agentLifecycleSubscriptionInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToAgentLifecycle(signal)) {
            if (event.serverId !== input.serverId) {
                continue;
            }

            await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
            yield agentLifecycleEventSchema.parse(event);
        }
    });
