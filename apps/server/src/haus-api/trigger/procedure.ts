import { TRPCError } from '@trpc/server';
import {
    TriggerAccessDeniedError,
    TriggerNotFoundError,
    TriggerRefusedError,
    TriggerRequestRefusedError,
} from '../../triggers/trigger-model.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Operator trigger work. Domain refusals become the tRPC codes the App reacts
 * to: a caller who is not an Owner or Admin gets FORBIDDEN, an unknown trigger
 * gets NOT_FOUND, a trigger that cannot take the request right now — it is
 * disabled, rate limited, or its anchor is gone — gets CONFLICT, and a request
 * the Server will not do at all (rotating a secretless Trigger) gets BAD_REQUEST.
 */
export const triggerProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof TriggerAccessDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }
    if (cause instanceof TriggerNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof TriggerRefusedError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof TriggerRequestRefusedError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    throw result.error;
});

export const triggerClock = { now: () => new Date() };
