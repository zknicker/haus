import { expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { toMembershipLossError } from '../src/haus-api/server/membership-loss.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../src/servers/server-access.ts';

/**
 * The App purges everything it has cached about a Server when this feed reports
 * membership loss, so only a real membership refusal may carry that code. A
 * database hiccup during delivery must stay an internal failure.
 */
test('a membership refusal during delivery is reported as losing access', () => {
    const denied = toMembershipLossError(new ServerAccessDeniedError());

    expect(denied).toBeInstanceOf(TRPCError);
    expect(denied).toMatchObject({ code: 'FORBIDDEN', refusal: 'membership_lost' });

    // A deleted Server is a membership loss too, with the same code.
    const missing = toMembershipLossError(new ServerNotFoundError('srv_gone'));

    expect(missing).toMatchObject({ code: 'FORBIDDEN', refusal: 'membership_lost' });
});

test('an unexpected failure during delivery is never reported as losing access', () => {
    expect(toMembershipLossError(new Error('connection terminated unexpectedly'))).toBeNull();
    expect(toMembershipLossError(new TypeError('undefined is not an object'))).toBeNull();
    expect(toMembershipLossError('something threw a string')).toBeNull();
    expect(toMembershipLossError(undefined)).toBeNull();
});

// The refusal keeps its domain cause; `serverProcedure` passes refusals through
// before remapping by cause class, so the code survives (haus-realtime-refusals).
test('the refusal keeps the original failure message and cause', () => {
    const cause = new ServerAccessDeniedError();

    expect(toMembershipLossError(cause)?.message).toBe(cause.message);
    expect(toMembershipLossError(cause)?.cause).toBe(cause);
});
