import { TRPCError } from '@trpc/server';
import { LinearApiError, type LinearApp } from '../../linear/linear-api.ts';
import { LinearRefusedError, linearAppUnconfigured } from '../../linear/linear-errors.ts';
import { linearUpdatedTopic } from '../../realtime/topics.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Linear connection work. Refusals keep their stable reason at the front of
 * the message (`linear_admin_required: …`); a Linear outage is BAD_GATEWAY so
 * the App can offer a retry instead of a fix.
 */
export const linearProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof LinearRefusedError) {
        throw new TRPCError({ cause, code: cause.code, message: cause.message });
    }
    if (cause instanceof LinearApiError) {
        throw new TRPCError({
            cause,
            code: 'BAD_GATEWAY',
            message: 'linear_unavailable: Linear did not answer. Try again shortly.',
        });
    }
    throw result.error;
});

export function requireLinearApp(app: LinearApp | null): LinearApp {
    if (!app) {
        throw linearAppUnconfigured();
    }
    return app;
}

/** `linear.onUpdated`: one connection's workspace or identities changed. */
export function announceLinearUpdated(input: { connectionId: string; serverId: string }) {
    linearUpdatedTopic.announce(input);
}

export const linearClock = { now: () => new Date() };
