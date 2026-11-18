import { TRPCError } from '@trpc/server';
import { AttachmentInventoryDeniedError } from '../../attachments/inventory-attachments.ts';
import { AttachmentNonceConflictError } from '../../attachments/reserve-attachment.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const attachmentProcedure = chatProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    if (result.error.cause instanceof AttachmentNonceConflictError) {
        throw new TRPCError({
            cause: result.error.cause,
            code: 'CONFLICT',
            message: result.error.cause.message,
        });
    }

    if (result.error.cause instanceof AttachmentInventoryDeniedError) {
        throw new TRPCError({
            cause: result.error.cause,
            code: 'FORBIDDEN',
            message: result.error.cause.message,
        });
    }

    throw result.error;
});
