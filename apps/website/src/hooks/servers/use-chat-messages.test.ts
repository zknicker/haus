import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import {
    appendToNewestPage,
    type TranscriptPage,
    toChatMessageLayout,
} from './chat-message-layout.ts';
import { mergeTranscriptPages } from './use-chat-messages.ts';

test('transcript pages merge oldest-first, keeping the newest copy of a duplicate id', () => {
    const newestDuplicate = toChatMessageLayout(message('msg_duplicate', 2, 'usr_newest'));
    const merged = mergeTranscriptPages([
        page([layout('msg_new', 3), newestDuplicate], { nextBeforeSequence: 2, scanned: 3 }),
        page([layout('msg_old', 1), toChatMessageLayout(message('msg_duplicate', 2))], {
            nextAfterSequence: 2,
            scanned: 2,
        }),
    ]);

    expect(merged?.entries.map(({ id }) => id)).toEqual(['msg_old', 'msg_duplicate', 'msg_new']);
    expect(merged?.entries.find(({ id }) => id === 'msg_duplicate')).toBe(newestDuplicate);
    expect(merged?.nextBeforeSequence).toBeNull();
    expect(merged?.nextAfterSequence).toBeNull();
});

test('a list page keeps ids and layout facts, never prose or annotations', () => {
    const entry = toChatMessageLayout({
        ...message('msg_task', 4),
        reactions: [{ actors: [{ handle: null, id: 'usr_inline', kind: 'human' }], emoji: '👍' }],
    });

    expect(Object.keys(entry).sort()).toEqual([
        'attachments',
        'author',
        'chatId',
        'createdAt',
        'id',
        'nonce',
        'reply',
        'runId',
        'sequence',
        'serverId',
    ]);
});

test('a tail append dedupes by id in sequence order and advances scannedThroughSequence', () => {
    const pages = [
        page([layout('msg_1', 1), layout('msg_2', 2)], { scanned: 2 }),
        page([layout('msg_0', 0)], { scanned: 0 }),
    ];
    const appended = appendToNewestPage(
        pages,
        page([layout('msg_2', 2), layout('msg_4', 4), layout('msg_3', 3)], { scanned: 9 })
    );

    expect(appended[0]?.entries.map(({ id }) => id)).toEqual(['msg_1', 'msg_2', 'msg_3', 'msg_4']);
    expect(appended[0]?.scannedThroughSequence).toBe(9);
    expect(appended[1]).toBe(pages[1]);
});

test('a filtered tail that matched nothing still moves the scan position, never back', () => {
    const pages = [page([layout('msg_1', 1)], { scanned: 5 })];

    expect(appendToNewestPage(pages, page([], { scanned: 12 }))[0]?.scannedThroughSequence).toBe(
        12
    );
    expect(appendToNewestPage(pages, page([], { scanned: 3 }))[0]?.scannedThroughSequence).toBe(5);
});

function page(
    entries: TranscriptPage['entries'],
    {
        nextAfterSequence = null,
        nextBeforeSequence = null,
        scanned,
    }: { nextAfterSequence?: number | null; nextBeforeSequence?: number | null; scanned: number }
): TranscriptPage {
    return { entries, nextAfterSequence, nextBeforeSequence, scannedThroughSequence: scanned };
}

function layout(id: string, sequence: number) {
    return toChatMessageLayout(message(id, sequence));
}

function message(id: string, sequence: number, userId = 'usr_inline'): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId },
        body: { kind: 'text' },
        chatId: 'cht_inline',
        cloudAgentWork: [],
        imageGenerations: [],
        content: id,
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
