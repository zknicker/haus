import { afterEach, expect, test } from 'bun:test';
import type { ChatSendInput } from '@haus/api';
import {
    chatDraftKey,
    resetChatDraftsForTest,
    updateChatDraftContent,
} from './chat-draft-store.ts';
import { submitChatComposer } from './submit-chat-composer.ts';

const draftKey = chatDraftKey('srv_focus', 'cht_focus');

afterEach(() => {
    resetChatDraftsForTest();
});

test('a successful send focuses the composer so the next message is ready', async () => {
    updateChatDraftContent(draftKey, 'Keep typing');
    const focuses: string[] = [];

    await submitChatComposer({
        attachmentInput: { current: null },
        chatId: 'cht_focus',
        clearAttachmentError: () => undefined,
        draftKey,
        focusTextEditor: () => {
            focuses.push('focus');
        },
        send: {
            mutateAsync: async (_input: ChatSendInput) => ({
                message: { chatId: 'cht_focus', id: 'msg_sent' },
            }),
        } as never,
        serverId: 'srv_focus',
        target: { chatId: 'cht_focus', kind: 'chat' },
        upload: { mutateAsync: async () => ({ id: 'unused' }) } as never,
    });

    expect(focuses).toEqual(['focus']);
});

test('a failed send focuses after take and again after restoring the draft', async () => {
    updateChatDraftContent(draftKey, 'Try again');
    const focuses: string[] = [];

    await submitChatComposer({
        attachmentInput: { current: null },
        chatId: 'cht_focus',
        clearAttachmentError: () => undefined,
        draftKey,
        focusTextEditor: () => {
            focuses.push('focus');
        },
        send: {
            mutateAsync: async (_input: ChatSendInput) => {
                throw new Error('offline');
            },
        } as never,
        serverId: 'srv_focus',
        target: { chatId: 'cht_focus', kind: 'chat' },
        upload: { mutateAsync: async () => ({ id: 'unused' }) } as never,
    });

    expect(focuses).toEqual(['focus', 'focus']);
});
