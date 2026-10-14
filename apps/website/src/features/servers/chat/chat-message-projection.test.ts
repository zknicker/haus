import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '@haus/api';
import {
    type ChatMessageLayout,
    toChatMessageLayout,
} from '../../../hooks/servers/chat-message-layout.ts';
import {
    emptyTranscriptSkeleton,
    projectTranscriptSkeleton,
    type TranscriptSkeletonInput,
} from './chat-message-projection.ts';

test('projecting the same list twice reuses the skeleton', () => {
    const same = input([layout('msg_1'), layout('msg_2')]);
    const first = projectTranscriptSkeleton(same, emptyTranscriptSkeleton);
    const second = projectTranscriptSkeleton({ ...same }, first);

    assert.equal(second, first);
});

test('a refetch that hands back new layout objects keeps every row and the array', () => {
    // A list refetch shares index-wise, so a shifted page yields fresh objects
    // for unchanged messages; rows compare their layout facts instead.
    const first = projectTranscriptSkeleton(
        input([layout('msg_1'), layout('msg_2')]),
        emptyTranscriptSkeleton
    );
    const second = projectTranscriptSkeleton(input([layout('msg_1'), layout('msg_2')]), first);

    assert.equal(second.rows, first.rows);
});

test('an appended id leaves the existing rows alone', () => {
    const first = projectTranscriptSkeleton(input([layout('msg_1')]), emptyTranscriptSkeleton);
    const second = projectTranscriptSkeleton(input([layout('msg_1'), layout('msg_2')]), first);

    assert.equal(second.rows.length, 2);
    assert.equal(second.rows[0], first.rows[0]);
});

test('a skeleton row carries layout facts and nothing mutable', () => {
    const [row] = projectTranscriptSkeleton(input([layout('msg_1')]), emptyTranscriptSkeleton).rows;

    assert.equal(row?.kind, 'message');
    assert.deepEqual(row?.entity, { attachedWork: false, chatId: 'cht_1', serverId: 'srv_1' });
    assert.equal(row?.message.content, '');
    assert.equal(row?.message.task, undefined);
    assert.equal(row?.message.reactions, undefined);
    assert.equal(row?.message.cloudAgentWork, undefined);
    assert.equal(row?.thread, null);
    assert.equal(row?.message.sendNonce, 'nonce_msg_1');
});

test('only a message gaining a task or Thread gets a new row', () => {
    const entries = [layout('msg_1'), layout('msg_2')];
    const first = projectTranscriptSkeleton(input(entries), emptyTranscriptSkeleton);
    const second = projectTranscriptSkeleton(input(entries, ['msg_2']), first);

    assert.equal(second.rows[0], first.rows[0]);
    assert.notEqual(second.rows[1], first.rows[1]);
    assert.equal(second.rows[1]?.entity?.attachedWork, true);
});

function input(
    entries: readonly ChatMessageLayout[],
    attachedWork: readonly string[] = []
): TranscriptSkeletonInput {
    return { attachedWork: new Set(attachedWork), entries };
}

function layout(id: string): ChatMessageLayout {
    const message: ChatMessage = {
        attachments: [],
        author: { kind: 'human', userId: 'usr_1' },
        body: { kind: 'text' },
        chatId: 'cht_1',
        cloudAgentWork: [],
        imageGenerations: [],
        content: id,
        createdAt: '2026-08-11T00:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence: Number(id.slice(-1)),
        serverId: 'srv_1',
        sessionGeneration: null,
        task: null,
    };
    return toChatMessageLayout(message);
}
