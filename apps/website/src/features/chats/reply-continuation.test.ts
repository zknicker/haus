import { expect, test } from 'bun:test';
import type { ChatMessageReplyReference } from '@haus/api';
import type { TranscriptActor, TranscriptRow } from './chat-transcript-model.ts';
import { buildTranscriptEntries } from './chat-transcript-model.ts';

type Author = Exclude<TranscriptActor, null>;

const agent: Author = { id: 'agent-1', kind: 'agent' };
const otherAgent: Author = { id: 'agent-2', kind: 'agent' };
const human: Author = { id: 'user-1', kind: 'participant' };
const at = (minute: number) => `2026-09-27T12:${String(minute).padStart(2, '0')}:00.000Z`;

test('a first reply starts its own group', () => {
    expect(continuations([message('m1', human), reply('m2', agent, 'm1')])).toEqual([false, false]);
});

test('a same-author follow-up to the same parent joins the group', () => {
    expect(
        continuations([message('m1', human), reply('m2', agent, 'm1'), reply('m3', agent, 'm1')])
    ).toEqual([false, false, true]);
});

test('a follow-up to a different parent starts a new group', () => {
    expect(
        continuations([message('m1', human), reply('m2', agent, 'm1'), reply('m3', agent, 'm0')])
    ).toEqual([false, false, false]);
});

test('another author in between starts a new group', () => {
    expect(
        continuations([
            message('m1', human),
            reply('m2', agent, 'm1'),
            reply('m3', otherAgent, 'm1'),
            reply('m4', agent, 'm1'),
        ])
    ).toEqual([false, false, false, false]);
});

test("a human's consecutive replies follow the same rule", () => {
    expect(
        continuations([message('m1', agent), reply('m2', human, 'm1'), reply('m3', human, 'm1')])
    ).toEqual([false, false, true]);
});

test('a non-reply in between starts a new group', () => {
    expect(
        continuations([
            message('m1', human),
            reply('m2', agent, 'm1'),
            message('m3', agent),
            reply('m4', agent, 'm1'),
        ])
    ).toEqual([false, false, false, false]);
});

test('a system entry in between starts a new group', () => {
    expect(
        continuations([
            message('m1', human),
            reply('m2', agent, 'm1'),
            systemMessage('s1'),
            reply('m3', agent, 'm1'),
        ])
    ).toEqual([false, false, null, false]);
});

test('a Thread on the previous reply keeps the follow-up out of its group', () => {
    const threaded = withThread(reply('m2', agent, 'm1'));
    expect(continuations([message('m1', human), threaded, reply('m3', agent, 'm1')])).toEqual([
        false,
        false,
        false,
    ]);
});

test('a skeleton row with attached work keeps the follow-up out of its group', () => {
    const skeleton = reply('m2', agent, 'm1');
    if (skeleton.kind === 'message') {
        skeleton.entity = { attachedWork: true, chatId: 'chat-1', serverId: 'server-1' };
    }
    expect(continuations([message('m1', human), skeleton, reply('m3', agent, 'm1')])).toEqual([
        false,
        false,
        false,
    ]);
});

test('a follow-up inside the grouping window joins; past it, starts a new group', () => {
    expect(
        continuations([
            message('m1', human, at(0)),
            reply('m2', agent, 'm1', at(1)),
            reply('m3', agent, 'm1', at(6)),
            reply('m4', agent, 'm1', at(12)),
        ])
    ).toEqual([false, false, true, false]);
});

test('a follow-up on another day starts a new group', () => {
    expect(
        continuations([
            message('m1', human, '2026-09-25T11:00:00.000Z'),
            reply('m2', agent, 'm1', '2026-09-25T12:00:00.000Z'),
            reply('m3', agent, 'm1', '2026-09-27T12:00:00.000Z'),
        ])
    ).toEqual([false, false, false]);
});

function continuations(rows: TranscriptRow[]) {
    return buildTranscriptEntries({ rows }).map((entry) =>
        entry.kind === 'turn' ? entry.continuesPrevious : null
    );
}

function withThread(row: TranscriptRow): TranscriptRow {
    if (row.kind === 'message') {
        row.thread = {
            anchorMessageId: row.id,
            followed: true,
            latestReplyAt: row.message.timestamp,
            replyCount: 1,
            threadChatId: `thread-${row.id}`,
            unreadCount: 0,
        };
    }
    return row;
}

function systemMessage(id: string): TranscriptRow {
    const row = message(id, human);
    if (row.kind === 'message') {
        row.actor = null;
        row.message.actor = null;
        row.message.senderType = 'system';
    }
    return row;
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
