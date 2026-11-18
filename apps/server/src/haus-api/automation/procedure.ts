import { TRPCError } from '@trpc/server';
import { AutomationFireContextNotFoundError } from '../../automations/fire-context.ts';
import { ChatAccessDeniedError, ChatNotFoundError } from '../../chats/chat-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Automation provenance reads. Access follows the message: a caller who cannot
 * read the Chat gets FORBIDDEN, and a message with no cause — or one that does
 * not exist — is the same NOT_FOUND, so the procedure never confirms a message
 * the caller cannot see.
 */
export const automationProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof ChatAccessDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }
    if (cause instanceof AutomationFireContextNotFoundError || cause instanceof ChatNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    throw result.error;
});
