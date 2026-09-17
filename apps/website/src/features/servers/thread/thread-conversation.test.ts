import { expect, test } from 'bun:test';
import { getTranscriptEntrySequences } from '../../chats/chat-read-visibility.ts';
import type { TranscriptMessageRow } from '../../chats/transcript-contract.ts';
import { threadConversationEntries } from './thread-conversation.ts';

test('interleaves channel and thread messages by time without merging their actions or read sequences', () => {
    const anchor = row('anchor', 0);
    const early = row('channel-early', 1);
    const thread = row('thread', 2);
    const later = row('channel-later', 3);
    const inline = [{ id: early.id }, { id: later.id }];
    const result = threadConversationEntries(
        [anchor, thread, later, early, anchor],
        inline,
        anchor.id
    );
    expect(result.map(({ entry }) => entry.id)).toEqual([
        'anchor',
        'channel-early',
        'thread',
        'channel-later',
    ]);
    expect(result.map(({ inParentChat }) => inParentChat)).toEqual([false, true, false, true]);
    expect(
        getTranscriptEntrySequences(
            result.map(({ entry }) => entry),
            [{ id: 'thread', sequence: 1 }]
        )
    ).toEqual(new Map([['thread', 1]]));
});

test('messages from the same agent run retain unique identities across sources', () => {
    const first = agentRow('one', 1);
    const second = agentRow('two', 2);
    const result = threadConversationEntries([first, second], [], 'anchor');
    expect(new Set(result.map(({ entry }) => entry.id)).size).toBe(2);
});

function agentRow(id: string, minute: number): TranscriptMessageRow {
    const source = row(id, minute);
    return {
        ...source,
        actor: { id: 'agent', kind: 'agent' },
        runId: 'run_shared',
        message: { ...source.message, senderType: 'agent' },
    };
}

function row(id: string, minute: number): TranscriptMessageRow {
    return {
        actor: { id: 'human', kind: 'participant' },
        id,
        kind: 'message',
        connectsToNext: false,
        connectsToPrevious: false,
        isFirstInGroup: true,
        message: {
            id,
            content: id,
            sender: 'Human',
            senderType: 'user',
            sourceSessionKey: 'human',
            timestamp: `2026-09-17T12:0${minute}:00.000Z`,
        },
    };
}
