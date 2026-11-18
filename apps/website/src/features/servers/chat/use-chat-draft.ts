import * as React from 'react';
import { attachmentMaxSizeBytes } from '../../../hooks/servers/use-upload-server-attachment.ts';
import type { Mention } from '../../mentions/mention-types.ts';
import {
    addChatDraftAttachments,
    readChatDraftState,
    removeChatDraftAttachment,
    subscribeChatDraft,
    updateChatDraftContent,
    updateChatDraftMentions,
} from './chat-draft-store.ts';

export function useChatDraft(key: string) {
    const subscribeToKey = React.useCallback(
        (listener: () => void) => subscribeChatDraft(key, listener),
        [key]
    );
    const getSnapshot = React.useCallback(() => readChatDraftState(key), [key]);
    const getServerSnapshot = React.useCallback(() => readChatDraftState(key), [key]);
    const state = React.useSyncExternalStore(subscribeToKey, getSnapshot, getServerSnapshot);
    const [attachmentError, setAttachmentError] = React.useState<{
        key: string;
        message: string | null;
    } | null>(null);
    const attachmentInput = React.useRef<HTMLInputElement>(null);

    const addAttachments = React.useCallback(
        (files: File[]) => {
            const oversized = files.find((file) => file.size > attachmentMaxSizeBytes);
            if (oversized) {
                setAttachmentError({
                    key,
                    message: `${oversized.name} exceeds the 50 MiB attachment limit.`,
                });
                if (attachmentInput.current) {
                    attachmentInput.current.value = '';
                }
                return;
            }

            setAttachmentError({ key, message: null });
            addChatDraftAttachments(key, files);
        },
        [key]
    );
    const clearAttachmentError = React.useCallback(
        () => setAttachmentError({ key, message: null }),
        [key]
    );
    const removeAttachment = React.useCallback(
        (nonce: string) => removeChatDraftAttachment(key, nonce),
        [key]
    );
    const updateContent = React.useCallback(
        (content: string | ((current: string) => string)) => updateChatDraftContent(key, content),
        [key]
    );
    const updateMentions = React.useCallback(
        (mentions: Mention[]) => updateChatDraftMentions(key, mentions),
        [key]
    );

    return {
        addAttachments,
        attachmentError: attachmentError?.key === key ? attachmentError.message : null,
        attachmentInput,
        attachments: state.draft.attachments,
        clearAttachmentError,
        content: state.draft.content,
        failed: state.failed,
        mentions: state.draft.mentions,
        removeAttachment,
        updateContent,
        updateMentions,
    };
}
