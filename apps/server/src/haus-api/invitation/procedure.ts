import { TRPCError } from '@trpc/server';
import {
    AlreadyServerMemberError,
    InvitationAuthorityError,
    InvitationEmailMismatchError,
    InvitationEmailTakenError,
    InvitationNotAcceptableError,
    InvitationNotFoundError,
} from '../../servers/invitation-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Invitation work for one Haus-authenticated human, with invitation refusals
 * reported as the tRPC codes the App reacts to. Server membership refusals are
 * already mapped upstream, so a non-member never learns an invitation exists.
 */
export const invitationProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    const { cause } = result.error;

    if (cause instanceof InvitationAuthorityError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof InvitationEmailTakenError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof InvitationNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof InvitationNotAcceptableError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof InvitationEmailMismatchError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof AlreadyServerMemberError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    throw result.error;
});
