import { afterEach, expect, test } from 'bun:test';
import type { ChatMessage, ChatSendInput } from '@haus/api';
import { threadInlineReplyMessages } from '../thread/thread-inline-replies.ts';
import {
    chatDraftKey,
    readChatDraftState,
    resetChatDraftsForTest,
    updateChatDraftContent,
} from './chat-draft-store.ts';
import { toChatInlineReplyTarget } from './chat-inline-reply.tsx';
import { submitChatComposer } from './submit-chat-composer.ts';

const draftKey = chatDraftKey('srv_inline', 'cht_inline');

afterEach(() => {
    resetChatDraftsForTest();
});

test('selecting a reply keeps the direct parent and existing chain root', () => {
    const root = reference('msg_root', 1, 'The root message');
    const parent: ChatMessage = {
        ...message('msg_parent', 2),
        reply: {
            parent: reference('msg_parent_parent', 1, 'Earlier parent'),
            parentMessageId: 'msg_parent_parent',
            root,
            rootMessageId: root.id,
        },
    };

    const target = toChatInlineReplyTarget(parent);

    expect(target.messageId).toBe(parent.id);
    expect(target.parent.id).toBe(parent.id);
    expect(target.parent.content).toBe(parent.content);
    expect(target.root).toBe(root);
});

test('task inspection keeps chain context while rendering its anchor once', () => {
    const root = message('msg_root', 1);
    const task = message('msg_task', 2);
    const reply = message('msg_reply', 3);

    expect(threadInlineReplyMessages([root, task, reply], task.id)).toEqual([root, reply]);
});

test('inline reply sends only the selected parent id and clears after success', async () => {
    updateChatDraftContent(draftKey, 'A response');
    const target = toChatInlineReplyTarget(message('msg_parent', 2));
    const sent: unknown[] = [];
    let cleared = 0;
    let clearedMessageId: string | null = null;

    await submitChatComposer({
        attachmentInput: { current: null },
        chatId: 'cht_inline',
        clearAttachmentError: () => undefined,
        draftKey,
        focusTextEditor: () => undefined,
        inlineReply: target,
        onInlineReplySent: (messageId) => {
            cleared += 1;
            clearedMessageId = messageId;
        },
        send: {
            mutateAsync: async (input: ChatSendInput) => {
                sent.push(input);
                return {
                    message: { chatId: 'cht_inline', id: 'msg_reply' },
                    threadChatId: null,
                };
            },
        } as never,
        serverId: 'srv_inline',
        target: { chatId: 'cht_inline', kind: 'chat' },
        upload: { mutateAsync: async () => ({ id: 'unused' }) } as never,
    });

    expect(sent[0]).toMatchObject({ replyToMessageId: 'msg_parent' });
    expect(cleared).toBe(1);
    expect(clearedMessageId ?? 'missing').toBe('msg_parent');
});

test('a failed inline send keeps the selection callback untouched for retry', async () => {
    updateChatDraftContent(draftKey, 'Try this again');
    const target = toChatInlineReplyTarget(message('msg_parent', 2));
    let cleared = 0;

    await submitChatComposer({
        attachmentInput: { current: null },
        chatId: 'cht_inline',
        clearAttachmentError: () => undefined,
        draftKey,
        focusTextEditor: () => undefined,
        inlineReply: target,
        onInlineReplySent: () => {
            cleared += 1;
        },
        send: {
            mutateAsync: async (_input: ChatSendInput) => {
                throw new Error('offline');
            },
        } as never,
        serverId: 'srv_inline',
        target: { chatId: 'cht_inline', kind: 'chat' },
        upload: { mutateAsync: async () => ({ id: 'unused' }) } as never,
    });

    expect(cleared).toBe(0);
    expect(readChatDraftState(draftKey).draft.content).toBe('Try this again');
});

function message(id: string, sequence: number): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_inline' },
        body: { kind: 'text' },
        chatId: 'cht_inline',
        content: `Message ${id}`,
        createdAt: '2026-08-22T12:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId: 'srv_inline',
        sessionGeneration: null,
    };
}

function reference(id: string, sequence: number, content: string) {
    return {
        author: { kind: 'human' as const, userId: 'usr_inline' },
        content,
        createdAt: '2026-08-22T12:00:00.000Z',
        id,
        sequence,
    };
}
