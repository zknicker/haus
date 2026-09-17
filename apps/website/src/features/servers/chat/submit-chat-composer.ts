import type * as React from 'react';
import type { useChatMessageSend } from '../../../hooks/servers/use-chat-message-send.ts';
import type { useUploadServerAttachment } from '../../../hooks/servers/use-upload-server-attachment.ts';
import { buildChatComposerSubmission } from '../../chats/chat-composer-submission.ts';
import type { ComposerAttachment } from './chat-draft-attachments.ts';
import {
    disposeChatDraftContents,
    readChatDraft,
    recoverFailedChatDraft,
    takeChatDraftForSend,
} from './chat-draft-store.ts';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';
import {
    addPendingChatMessage,
    dropPendingChatMessage,
    settlePendingChatMessage,
} from './use-pending-messages.ts';

export async function submitChatComposer({
    attachmentInput,
    chatId,
    clearAttachmentError,
    draftKey,
    event,
    focusTextEditor,
    inlineReply,
    onMaterialized,
    onInlineReplySent,
    onThreadCreated,
    pendingChatId,
    send,
    serverId,
    target,
    thread,
    upload,
}: {
    attachmentInput: React.RefObject<HTMLInputElement | null>;
    chatId?: string;
    clearAttachmentError: () => void;
    draftKey: string;
    event?: React.FormEvent;
    focusTextEditor: () => void;
    inlineReply?: ChatInlineReplyTarget | null;
    onMaterialized?: (chatId: string) => void;
    onInlineReplySent?: (messageId: string) => void;
    onThreadCreated?: (threadChatId: string) => void;
    pendingChatId?: string;
    send: Pick<ReturnType<typeof useChatMessageSend>, 'mutateAsync'>;
    serverId: string;
    target: { agentId: string; kind: 'agent-dm' } | { chatId: string; kind: 'chat' };
    thread?: { anchorMessageId: string };
    upload: Pick<ReturnType<typeof useUploadServerAttachment>, 'mutateAsync'>;
}) {
    event?.preventDefault();
    const current = readChatDraft(draftKey);
    const { content } = buildChatComposerSubmission({
        content: current.content,
        mentions: current.mentions,
    });
    if (content.length === 0 && current.attachments.length === 0) {
        return;
    }

    const submitted = takeChatDraftForSend(draftKey);
    if (attachmentInput.current) {
        attachmentInput.current.value = '';
    }
    clearAttachmentError();
    const nonce = crypto.randomUUID();

    try {
        if (pendingChatId) {
            addPendingChatMessage(pendingChatId, {
                attachments: submitted.attachments.map(pendingAttachment),
                content,
                nonce,
                reply: inlineReply
                    ? {
                          parent: inlineReply.parent,
                          parentMessageId: inlineReply.messageId,
                          root: inlineReply.root,
                          rootMessageId: inlineReply.root.id,
                      }
                    : null,
            });
        }
        const uploaded = await Promise.all(
            submitted.attachments.map((attachment) =>
                upload.mutateAsync({
                    chatId: chatId ?? '',
                    file: attachment.file,
                    nonce: attachment.nonce,
                    serverId,
                })
            )
        );
        const receipt = await send.mutateAsync(
            target.kind === 'agent-dm'
                ? {
                      agentId: target.agentId,
                      attachmentIds: [],
                      content,
                      nonce,
                      serverId,
                      targetKind: 'agent-dm',
                  }
                : {
                      attachmentIds: uploaded.map((attachment) => attachment.id),
                      chatId: target.chatId,
                      content,
                      nonce,
                      ...(inlineReply ? { replyToMessageId: inlineReply.messageId } : {}),
                      serverId,
                      thread,
                  }
        );
        disposeChatDraftContents(submitted);
        onMaterialized?.(receipt.message.chatId);
        if (pendingChatId) {
            settlePendingChatMessage({
                chatId: pendingChatId,
                messageId: receipt.message.id,
                nonce,
            });
        }
        if (inlineReply) {
            onInlineReplySent?.(inlineReply.messageId);
        }
        if (receipt.threadChatId) {
            onThreadCreated?.(receipt.threadChatId);
        }
    } catch {
        if (pendingChatId) {
            dropPendingChatMessage(pendingChatId, nonce);
        }
        recoverFailedChatDraft(draftKey, submitted);
        focusTextEditor();
    }
}

function pendingAttachment(attachment: ComposerAttachment) {
    return {
        filename: attachment.file.name,
        id: attachment.nonce,
        mediaType: attachment.file.type || 'application/octet-stream',
        sizeBytes: attachment.file.size,
    };
}
