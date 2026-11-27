import { expect, test } from 'bun:test';
import { type AgentStartCommand, agentStartCommandSchema } from '@haus/api';
import { composeTurnInput } from './turn-input.ts';

const chatId = '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d01';

const message = (id: string, sequence: number, senderHandle: string, content: string) => ({
    chatId,
    content,
    createdAt: `2026-11-19T15:0${sequence}:00.000Z`,
    id,
    senderHandle,
    senderType: 'human' as const,
    sequence,
    target: '#product',
});

function start(overrides: Partial<AgentStartCommand>) {
    return agentStartCommandSchema.parse({
        agentId: '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d02',
        agentName: 'blippy',
        chatId,
        inboxDelivery: 'concrete',
        modelId: 'claude-sonnet-5',
        runId: '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d03',
        runtimeId: 'claude-agent-sdk',
        sessionGeneration: 2,
        totalPending: 2,
        type: 'start',
        ...overrides,
    });
}

const first = message(
    '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d11',
    1,
    'maya',
    'Can you draft the launch note?'
);
const second = message(
    '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d12',
    2,
    'theo',
    'Also check the pricing page.'
);

const noticeLines = (summary: string, row: string) => [
    '[Haus inbox notice:',
    summary,
    row,
    ']',
    "These messages have not been read. Choose when to read them: `haus message read --target <target> --unread` reads one conversation's unread messages; `haus message check` reads all of them.",
    'Their bodies are withheld to avoid flooding you, not absent. The notice is not itself a request, so do not acknowledge it. If what you read is higher priority, pivot to it; otherwise continue your current work. Deferral needs no visible reply and the messages remain queryable; read them before you stop.',
];

test('a cold reset turn drains the addressed message and notices the rest', () => {
    const input = composeTurnInput(
        start({
            drainItemIds: [first.id],
            inbox: [first, second],
            unreadElsewhere: [{ count: 3, target: '#all' }],
        }),
        {
            isColdStart: true,
            resumesInterruptedTurn: false,
            sessionGeneration: 2,
            sessionKind: 'captain',
        },
        []
    );
    expect(input.drained.map((item) => item.id)).toEqual([first.id]);
    expect(input.turnContent).toBe(
        [
            'Fresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact; MEMORY.md is your recovery point.',
            '',
            'New message received:',
            '',
            '[target=#product msg=0196f0c4 time=2026-11-19 15:01:00 UTC type=human] maya: Can you draft the launch note?',
            '',
            'Respond as appropriate. Complete all your work before stopping.',
            "Each message's `target` identifies the conversation where it was asked.",
            '',
            ...noticeLines(
                'Inbox update: 1 unread message total; 1 changed target',
                '#product  pending: 1 message · first msg=0196f0c4 · latest sender @theo · latest msg=0196f0c4'
            ),
            '',
            'You also have unread messages in other channels:',
            '- #all: 3 unread',
            'Run `haus inbox check` at a natural breakpoint if you choose to inspect those targets; it lists every unread conversation with the command that opens it.',
        ].join('\n')
    );
});

test('a resumed notice-lane turn after a Stop carries the interruption line and the notice', () => {
    const input = composeTurnInput(
        start({ drainItemIds: [], inbox: [first, second], inboxDelivery: 'notice' }),
        {
            isColdStart: false,
            resumesInterruptedTurn: true,
            sessionGeneration: 2,
            sessionKind: 'captain',
        },
        []
    );
    expect(input.drained).toEqual([]);
    expect(input.notice).toBe(
        noticeLines(
            'Inbox update: 2 unread messages total; 1 changed target',
            '#product  pending: 2 messages · first msg=0196f0c4 · latest sender @theo · latest msg=0196f0c4'
        ).join('\n')
    );
    expect(input.turnContent).toBe(
        [
            'Your previous turn was interrupted by Haus (a Stop, a restart, or a stalled-turn timeout), not by anyone in the conversation. A tool call it cancelled may read as declined or rejected by the user; nobody declined it, and its side effects may be partial. Any work that turn left unfinished is offered again here.',
            '',
            input.notice,
        ].join('\n')
    );
});

test('a cold first-generation turn with nothing pending is bare Start.', () => {
    const input = composeTurnInput(
        start({ inbox: [], totalPending: 0 }),
        {
            isColdStart: true,
            resumesInterruptedTurn: false,
            sessionGeneration: 1,
            sessionKind: 'captain',
        },
        []
    );
    expect(input.turnContent).toBe('Start.');
});

test('a Drive conflict run is chatless and tells its own edits apart by handle', () => {
    const input = composeTurnInput(
        start({
            chatId: null,
            driveConflict: {
                files: [
                    {
                        copyPath: null,
                        currentAuthorHandle: 'blippy',
                        currentRevisionId: 'rev_1',
                        outcome: 'kept_edit',
                        path: 'haus/brief.md',
                        reason: 'edit_over_delete',
                    },
                ],
                id: 'drive-conflict:run_8f2',
                pushId: 'run_8f2',
                writer: { agentId: '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d02', type: 'agent' },
            },
            totalPending: 0,
        }),
        {
            isColdStart: false,
            resumesInterruptedTurn: false,
            sessionGeneration: 2,
            sessionKind: 'captain',
        },
        []
    );
    expect(input).toEqual({
        drained: [],
        notice: null,
        turnContent: [
            '[drive conflict · 1 file · your push after run_8f2]',
            'haus/brief.md · it was deleted, and your edit brought it back',
            'An edit always beats a delete. Delete the file again if you still mean to.',
        ].join('\n'),
    });
});

test('the turn after a runner crash names the tool calls the crash left unknown', () => {
    const input = composeTurnInput(
        start({ inbox: [], inboxDelivery: 'notice', totalPending: 0 }),
        {
            isColdStart: false,
            resumesInterruptedTurn: false,
            sessionGeneration: 2,
            sessionKind: 'captain',
        },
        ['toolu_1', 'toolu_2']
    );
    expect(input.turnContent).toBe(
        'Haus restarted during your last turn, so these tool calls may or may not have taken effect: toolu_1, toolu_2. Check their effects before running them again.\n\nResume the interrupted turn.'
    );
});

test('an Issue assignment teaches crew to a Captain and not to a Task, which cannot start one', () => {
    const assigned = start({
        chatId: null,
        issueAssignments: [
            {
                by: '@ada',
                byAgent: false,
                code: 'GEN-12',
                id: 'issue-assign:iss_12:2',
                issueId: 'iss_12',
                priority: 'high',
                state: 'todo',
                title: 'Rotate the deploy key',
            },
        ],
        totalPending: 0,
    });
    const session = { isColdStart: false, resumesInterruptedTurn: false, sessionGeneration: 2 };
    const crew = /haus task start --issue/u;
    const as = (sessionKind: 'captain' | 'task') =>
        composeTurnInput(assigned, { ...session, sessionKind }, []).turnContent;
    expect(as('captain')).toMatch(crew);
    expect(as('task')).not.toMatch(crew);
});
