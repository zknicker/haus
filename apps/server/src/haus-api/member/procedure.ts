import { TRPCError } from '@trpc/server';
import {
    ServerConfirmationError,
    ServerMemberAuthorityError,
    ServerMemberNotFoundError,
} from '../../servers/member-access.ts';
import { ParticipantHandleTakenError } from '../../servers/participant-handles.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Membership work for one Haus-authenticated human. The last-Owner invariant
 * is a conflict rather than a permission problem: the request was legitimate,
 * the Server simply cannot lose its final Owner.
 */
export const serverMemberProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    const { cause } = result.error;

    if (cause instanceof ServerMemberAuthorityError) {
        throw new TRPCError({ cause, code: memberRefusalCode(cause), message: cause.message });
    }

    if (cause instanceof ServerConfirmationError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    if (cause instanceof ServerMemberNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof ParticipantHandleTakenError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    throw result.error;
});

function memberRefusalCode(error: ServerMemberAuthorityError) {
    if (error.reason === 'last-owner') {
        return 'CONFLICT' as const;
    }

    if (error.reason === 'no-op' || error.reason === 'not-self' || error.reason === 'use-leave') {
        return 'BAD_REQUEST' as const;
    }

    return 'FORBIDDEN' as const;
}
