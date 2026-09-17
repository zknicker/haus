import { TRPCError } from '@trpc/server';
import { AttachmentAssociationError } from '../../attachments/message-attachments.ts';
import { RetiredAgentDmSendError } from '../../chats/active-dm-peer.ts';
import {
    ChannelLifecycleConflictError,
    ChannelLifecycleDeniedError,
} from '../../chats/channel-lifecycle.ts';
import {
    ChatAccessDeniedError,
    ChatArchivedError,
    ChatNotFoundError,
} from '../../chats/chat-access.ts';
import { ChannelAgentNotFoundError, ChannelNameTakenError } from '../../chats/create-channel.ts';
import { DmPeerNotFoundError, InvalidDmPeerError } from '../../chats/ensure-dm.ts';
import { InvalidInlineReplyError } from '../../chats/reply-context.ts';
import { ChatNonceConflictError, DirectThreadSendError } from '../../chats/send-message.ts';
import { InvalidThreadAnchorError, NestedThreadError } from '../../threads/ensure-thread.ts';
import { memberProcedure } from '../server/procedure.ts';

export const chatProcedure = memberProcedure.use(async ({ next }) => {
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

    if (cause instanceof ChatArchivedError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof ChatNonceConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof RetiredAgentDmSendError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof AttachmentAssociationError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof DmPeerNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof InvalidDmPeerError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    if (cause instanceof InvalidInlineReplyError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    if (cause instanceof ChannelAgentNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof ChannelNameTakenError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof ChannelLifecycleDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof ChannelLifecycleConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (
        cause instanceof DirectThreadSendError ||
        cause instanceof InvalidThreadAnchorError ||
        cause instanceof NestedThreadError
    ) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    throw result.error;
});
