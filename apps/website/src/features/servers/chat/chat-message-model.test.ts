import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { buildTranscriptEntries, getItemRunId } from '../../chats/chat-transcript-model.ts';
import { mergeTaskAnchor, projectChatMessages } from './chat-message-model.ts';

test('keeps an older task anchor available when the latest transcript page omits it', () => {
    const anchor = message('message_anchor', 1);
    const latest = message('message_latest', 51);

    expect(mergeTaskAnchor([latest], anchor)).toEqual([anchor, latest]);
    expect(mergeTaskAnchor([anchor, latest], anchor)).toEqual([anchor, latest]);
});

test('projects Server messages into the preserved transcript contract', () => {
    const human = message('message_human', 1);
    human.attachments = [
        {
            filename: 'map.txt',
            id: 'attachment_one',
            mediaType: 'text/plain',
            sizeBytes: 42,
        },
    ];
    human.reactions = [
        {
            actors: [{ handle: 'owner', id: 'user_one', kind: 'human' }],
            emoji: '👍',
        },
    ];
    const agent: ChatMessage = {
        ...message('message_agent', 2),
        author: { agentId: 'agent_one', kind: 'agent' },
        runId: 'run_agent',
    };
    const rows = projectChatMessages(
        [human, agent],
        [
            {
                anchorMessageId: human.id,
                followed: true,
                latestReplyAt: agent.createdAt,
                recentReplies: [],
                replyCount: 1,
                threadChatId: 'thread_one',
                unreadCount: 0,
            },
        ]
    );
    const humanRow = rows[0];
    const agentRow = rows[1];

    expect(humanRow?.kind).toBe('message');
    expect(humanRow?.kind === 'message' ? humanRow.actor : null).toEqual({
        id: 'user_one',
        kind: 'participant',
    });
    expect(humanRow?.kind === 'message' ? humanRow.message.attachments?.[0] : null).toEqual({
        filename: 'map.txt',
        mediaType: 'text/plain',
        path: 'hosted:attachment_one',
        sizeBytes: 42,
        type: 'file',
    });
    expect(humanRow?.kind === 'message' ? humanRow.thread?.threadChatId : null).toBe('thread_one');
    expect(humanRow?.kind === 'message' ? humanRow.message.reactions : null).toEqual([
        {
            actors: [{ handle: 'owner', id: 'user_one', kind: 'human' }],
            emoji: '👍',
        },
    ]);
    expect(agentRow?.kind === 'message' ? agentRow.actor : null).toEqual({
        id: 'agent_one',
        kind: 'agent',
    });
    expect(agentRow?.kind === 'message' ? agentRow.runId : null).toBe('run_agent');

    const agentEntry = buildTranscriptEntries({ rows }).find(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    expect(agentEntry?.kind === 'turn' ? agentEntry.id : null).toBe('turn:run_agent');
    expect(
        agentEntry?.kind === 'turn' && agentEntry.items[0]
            ? getItemRunId(agentEntry.items[0])
            : null
    ).toBe('run_agent');
});

test('preserves one global Agent run identity when messages come from multiple Chats', () => {
    const runId = 'run_global';
    const first: ChatMessage = {
        ...message('message_first', 1),
        author: { agentId: 'agent_one', kind: 'agent' },
        chatId: 'chat_first',
        runId,
    };
    const second: ChatMessage = {
        ...message('message_second', 2),
        author: { agentId: 'agent_one', kind: 'agent' },
        chatId: 'chat_second',
        runId,
    };

    const rows = projectChatMessages([first, second], []);

    expect(
        rows
            .filter((row) => row.kind === 'message')
            .map((row) => (row.kind === 'message' ? row.runId : null))
    ).toEqual([runId, runId]);
});

test('renders an agent-created Message as its own content, with no extra row', () => {
    const rows = projectChatMessages(
        [
            {
                ...message('message_created', 1),
                author: { agentId: 'agent_one', kind: 'agent' },
                body: {
                    agent: {
                        agentId: 'agt_1234567890abcdef',
                        avatarUrl: null,
                        description: 'Keeps the release calendar honest.',
                        displayName: 'Orbit',
                        handle: 'orbit',
                        retired: false,
                    },
                    kind: 'agent-created',
                },
                content: 'Meet [@orbit](agent://agt_1234567890abcdef).',
                runId: 'run_agent',
            },
        ],
        []
    );
    const created = rows[0];

    expect(created?.kind === 'message' ? created.message.content : null).toBe(
        'Meet [@orbit](agent://agt_1234567890abcdef).'
    );
});

function message(id: string, sequence: number): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'user_one' },
        body: { kind: 'text' },
        chatId: 'chat_one',
        content: id,
        createdAt: '2026-07-26T12:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId: 'server_one',
        sessionGeneration: null,
    };
}
