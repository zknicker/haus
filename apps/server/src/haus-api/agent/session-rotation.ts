import { agentSessionRotationInputSchema, agentSessionRotationSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { readSessionRotation } from '../../agent-delivery/session-rotation.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { requireAgent } from '../../server-agents/agent-delivery-control.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/** When one session generation began, and why. */
export const agentSessionRotationProcedure = memberProcedure
    .input(agentSessionRotationInputSchema)
    .output(agentSessionRotationSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        try {
            await requireAgent(ctx.hausDb, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
        const rotation = await readSessionRotation(ctx.hausDb, input);
        if (!rotation) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'No session rotation is recorded for that generation.',
            });
        }
        return rotation;
    });
