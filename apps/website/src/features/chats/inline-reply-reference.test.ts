import { expect, test } from 'bun:test';
import type { ChatMessageReplyReference } from '@haus/api';
import type { TranscriptActor, TranscriptRow } from './chat-transcript-model.ts';
import { buildTranscriptEntries } from './chat-transcript-model.ts';
import { buildTranscriptRenderRows } from './chat-transcript-row-model.ts';

type Author = Exclude<TranscriptActor, null>;

const agent: Author = { id: 'agent-1', kind: 'agent' };
const otherAgent: Author = { id: 'agent-2', kind: 'agent' };
const human: Author = { id: 'user-1', kind: 'participant' };

test('a first reply shows its header', () => {
    expect(replyHeaders([message('m1', human), reply('m2', agent, 'm1')])).toEqual([true, true]);
});

test('a same-author follow-up to the same parent hides its header', () => {
    expect(
        replyHeaders([message('m1', human), reply('m2', agent, 'm1'), reply('m3', agent, 'm1')])
    ).toEqual([true, true, false]);
});

test('a follow-up to a different parent shows its header', () => {
    expect(
        replyHeaders([message('m1', human), reply('m2', agent, 'm1'), reply('m3', agent, 'm0')])
    ).toEqual([true, true, true]);
});

test('another author in between shows the header again', () => {
    expect(
        replyHeaders([
            message('m1', human),
            reply('m2', agent, 'm1'),
            reply('m3', otherAgent, 'm1'),
            reply('m4', agent, 'm1'),
        ])
    ).toEqual([true, true, true, true]);
});

test("a human's consecutive replies follow the same rule", () => {
    expect(
        replyHeaders([message('m1', agent), reply('m2', human, 'm1'), reply('m3', human, 'm1')])
    ).toEqual([true, true, false]);
});

test('a non-reply in between shows the header again', () => {
    expect(
        replyHeaders([
            message('m1', human),
            reply('m2', agent, 'm1'),
            message('m3', agent),
            reply('m4', agent, 'm1'),
        ])
    ).toEqual([true, true, true, true]);
});

test('a follow-up across a day divider still hides its header', () => {
    const rows = [
        message('m1', human, '2026-09-25T11:00:00.000Z'),
        reply('m2', agent, 'm1', '2026-09-25T12:00:00.000Z'),
        reply('m3', agent, 'm1', '2026-09-27T12:00:00.000Z'),
    ];
    const renderRows = buildTranscriptRenderRows(buildTranscriptEntries({ rows }), 0);

    expect(renderRows.map((row) => row.kind)).toEqual([
        'dayDivider',
        'entry',
        'entry',
        'dayDivider',
        'entry',
    ]);
    expect(replyHeaders(rows)).toEqual([true, true, false]);
});

function replyHeaders(rows: TranscriptRow[]) {
    return buildTranscriptEntries({ rows }).map((entry) =>
        entry.kind === 'turn' ? entry.showReplyReference : null
    );
}

function reply(id: string, author: Author, parentId: string, timestamp?: string): TranscriptRow {
    const row = message(id, author, timestamp);
    if (row.kind === 'message') {
        row.message.reply = {
            parent: reference(parentId),
            parentMessageId: parentId,
            root: reference(parentId),
            rootMessageId: parentId,
        };
    }
    return row;
}

function message(
    id: string,
    author: Author,
    timestamp = '2026-09-27T12:00:00.000Z'
): TranscriptRow {
    const isAgent = author.kind === 'agent';
    return {
        actor: author,
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor: author,
            content: `Message ${id}`,
            id,
            metadata: isAgent ? { runtime: { runId: `run-${id}` } } : undefined,
            sender: isAgent ? 'Agent' : 'Human',
            senderType: isAgent ? 'agent' : 'user',
            sourceSessionId: null,
            sourceSessionKey: '',
            hausAgentId: isAgent ? author.id : null,
            timestamp,
        },
    };
}

function reference(id: string): ChatMessageReplyReference {
    return {
        author: { kind: 'human', userId: 'user-1' },
        content: `Message ${id}`,
        createdAt: '2026-09-27T12:00:00.000Z',
        id,
        sequence: 1,
    };
}
