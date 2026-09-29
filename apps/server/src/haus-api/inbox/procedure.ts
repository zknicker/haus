import { TRPCError } from '@trpc/server';
import { ChatAccessDeniedError, ChatNotFoundError } from '../../chats/chat-access.ts';
import { NeedsYouDoneBeyondLatestError } from '../../needs-you/mark-done.ts';
import { memberProcedure } from '../server/procedure.ts';

export const inboxProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof ChatAccessDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }
    if (cause instanceof ChatNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof NeedsYouDoneBeyondLatestError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    throw result.error;
});
