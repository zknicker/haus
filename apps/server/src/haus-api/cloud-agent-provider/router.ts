import type { CloudAgentCapabilityRequest, CloudAgentProvider } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    CloudAgentCapabilityDeniedError,
    requestCloudAgentCapability,
} from '../../cloud-agents/request-cloud-agent-capability.ts';
import type { HausUser } from '../../users/haus-user.ts';
import type { HausContext } from '../context.ts';
import { memberProcedure } from '../server/procedure.ts';
import { createRouter } from '../trpc.ts';
import {
    cloudAgentProviderActionInputSchema,
    cloudAgentProviderGetInputSchema,
    cloudAgentProviderOutputSchema,
} from './contracts.ts';

/**
 * Cloud Agent provider access on one Computer. `connect` runs the provider's
 * sign-in on that Computer and returns its browser link; Server never
 * sees, stores, or forwards the credential it mints. `makeDefault` names the
 * provider an Agent's `start` uses on that Computer when it names none.
 */
export const cloudAgentProviderRouter = createRouter({
    cancelSignIn: actionProcedure('cancel-sign-in'),
    connect: actionProcedure('connect'),
    disconnect: actionProcedure('disconnect'),
    makeDefault: actionProcedure('make-default'),
    get: memberProcedure
        .input(cloudAgentProviderGetInputSchema)
        .output(cloudAgentProviderOutputSchema)
        .query(({ ctx, input }) => relay(ctx, input, { kind: 'get' })),
});

function actionProcedure(kind: 'connect' | 'disconnect' | 'cancel-sign-in' | 'make-default') {
    return memberProcedure
        .input(cloudAgentProviderActionInputSchema)
        .output(cloudAgentProviderOutputSchema)
        .mutation(({ ctx, input }) => relay(ctx, input, { kind }));
}

async function relay(
    ctx: HausContext & { member: HausUser | null },
    input: { computerId: string; provider: CloudAgentProvider; serverId: string },
    operation: CloudAgentCapabilityRequest['operation']
) {
    try {
        return await requestCloudAgentCapability(ctx.hausDb, ctx.computerConnections, ctx.member, {
            ...input,
            operation,
        });
    } catch (cause) {
        if (cause instanceof CloudAgentCapabilityDeniedError) {
            throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
        }
        throw cause;
    }
}
