import { afterEach, expect, test } from 'bun:test';
import type { Mention } from '../../mentions/mention-types.ts';
import {
    addChatDraftAttachments,
    agentDmDraftKey,
    chatDraftKey,
    readChatDraft,
    readChatDraftState,
    recoverFailedChatDraft,
    resetChatDraftsForTest,
    restoreFailedChatDraft,
    takeChatDraftForSend,
    threadDraftKey,
    updateChatDraftContent,
    updateChatDraftMentions,
} from './chat-draft-store.ts';

afterEach(() => {
    resetChatDraftsForTest();
});

test('drafts persist by Chat and keep Threads and Agent DMs separate', () => {
    const chatKey = chatDraftKey('srv_1', 'chat_1');
    const threadKey = threadDraftKey('srv_1', 'chat_1', 'msg_anchor');
    const dmKey = agentDmDraftKey('srv_1', 'agent_1');

    updateChatDraftContent(chatKey, 'channel work');
    updateChatDraftContent(threadKey, 'thread work');
    updateChatDraftContent(dmKey, 'dm work');

    expect(readChatDraftState(chatKey).draft.content).toBe('channel work');
    expect(readChatDraftState(threadKey).draft.content).toBe('thread work');
    expect(readChatDraftState(dmKey).draft.content).toBe('dm work');
    expect(chatKey).not.toBe(threadKey);
    expect(chatKey).not.toBe(dmKey);
});

test('selected files and mention metadata remain in the scoped draft', () => {
    const key = chatDraftKey('srv_1', 'chat_1');
    const mention = createMention();

    updateChatDraftContent(key, '@Planner review this');
    updateChatDraftMentions(key, [mention]);
    addChatDraftAttachments(key, [new File(['notes'], 'notes.txt', { type: 'text/plain' })]);

    const draft = readChatDraftState(key).draft;
    expect(draft.content).toBe('@Planner review this');
    expect(draft.mentions).toEqual([mention]);
    expect(draft.attachments.map((attachment) => attachment.file.name)).toEqual(['notes.txt']);
});

test('a delayed failed send preserves newer work as a separate recovery', async () => {
    const key = chatDraftKey('srv_1', 'chat_1');
    const firstMention = createMention();
    const secondMention = { ...firstMention, id: 'agent://agt_writer', text: '@Writer' };

    updateChatDraftContent(key, '@Planner review this');
    updateChatDraftMentions(key, [firstMention]);
    const first = takeChatDraftForSend(key);

    let rejectFirst!: (error: Error) => void;
    const firstSend = new Promise<never>((_, reject) => {
        rejectFirst = reject;
    });
    updateChatDraftContent(key, '@Writer keep this work');
    updateChatDraftMentions(key, [secondMention]);

    rejectFirst(new Error('delayed failure'));
    await firstSend.catch(() => undefined);
    recoverFailedChatDraft(key, first);

    const state = readChatDraftState(key);
    expect(state.draft.content).toBe('@Writer keep this work');
    expect(state.draft.mentions).toEqual([secondMention]);
    expect(state.failed).toHaveLength(1);
    expect(state.failed[0]?.content).toBe('@Planner review this');
    expect(state.failed[0]?.mentions).toEqual([firstMention]);
});

test('restoring a failed draft swaps, rather than discards, current work', () => {
    const key = chatDraftKey('srv_1', 'chat_1');
    const first = takeAfterWriting(key, 'first failed message');

    updateChatDraftContent(key, 'new work to preserve');
    recoverFailedChatDraft(key, first);
    const failedId = readChatDraftState(key).failed[0]?.id;

    expect(failedId).toBeString();
    restoreFailedChatDraft(key, failedId!);

    const state = readChatDraftState(key);
    expect(state.draft.content).toBe('first failed message');
    expect(state.failed.map((draft) => draft.content)).toEqual(['new work to preserve']);
});

test('a pasted file with no browser type takes the type its bytes resolve to', async () => {
    const key = 'server:s:chat:sniff';
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
    addChatDraftAttachments(key, [
        new File([png], 'clipboard', { type: '' }),
        new File(['a,b'], 'table.csv', { type: '' }),
        new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ]);

    // The extension answers synchronously; the bytes answer a moment later.
    expect(readChatDraft(key).attachments.map((attachment) => attachment.mediaType)).toEqual([
        '',
        'text/csv',
        'text/plain',
    ]);
    await waitFor(() => readChatDraft(key).attachments[0]?.mediaType === 'image/png');
    expect(readChatDraft(key).attachments.map((attachment) => attachment.mediaType)).toEqual([
        'image/png',
        'text/csv',
        'text/plain',
    ]);
});

async function waitFor(condition: () => boolean) {
    for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

function takeAfterWriting(key: string, content: string) {
    updateChatDraftContent(key, content);
    return takeChatDraftForSend(key);
}

function createMention(): Mention {
    return {
        end: 8,
        id: 'agent://agt_planner',
        kind: 'agent',
        label: 'Planner',
        projection: 'agent-reference',
        start: 0,
        text: '@Planner',
    };
}
