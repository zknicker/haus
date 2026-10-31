import { TRPCError } from '@trpc/server';
import {
    AvatarDeniedError,
    AvatarOwnerNotFoundError,
    AvatarRejectedError,
} from '../../avatars/avatar-errors.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Avatar writes for one Haus-authenticated human. */
export const avatarProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    const { cause } = result.error;

    if (cause instanceof AvatarDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof AvatarOwnerNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof AvatarRejectedError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    throw result.error;
});
