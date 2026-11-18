import { expect, test } from 'bun:test';
import type { TranscriptRow } from './chat-transcript-model.ts';
import { buildTranscriptEntries, getItemRunId } from './chat-transcript-model.ts';

type ChatRow = TranscriptRow;
type ToolChatRow = Extract<ChatRow, { kind: 'tool' }>;

test('clarification tool rows join their turn comment by response id', () => {
    const rows: ChatRow[] = [
        userMessage('user-1', 'Use the tool', false, false),
        withResponseId(toolRow('tool-1', false, false), 'rsp_1'),
        withResponseId(agentMessage('agent-1', 'Done.', false, false), 'rsp_1'),
    ];

    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'turn', participant: 'user' });
    expect(entries[1]).toMatchObject({ id: 'turn:rsp_1', kind: 'turn', participant: 'agent' });

    if (entries[1]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    // The attachment renders below the reply, inside the same comment.
    expect(
        entries[1].items.map((item) => (item.kind === 'row' ? item.row.kind : item.kind))
    ).toEqual(['message', 'tool']);
});

test('buildTranscriptEntries keeps a new run out of the previous run turn entry', () => {
    // Live-projected rows carry no response id, so run identity must split
    // the turns: the next run's narration never appends to the prior reply.
    const nextRunNarration: ChatRow = {
        actor: { id: 'agent-1', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id: 'act_run_next_message_0',
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor: { id: 'agent-1', kind: 'agent' },
            content: 'I will inspect the workspace layout before making any changes.',
            id: 'act_run_next_message_0',
            metadata: { runtime: { runId: 'run_next', sessionKey: handoffSession } },
            sender: 'Agent',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: handoffSession,
            hausAgentId: 'agent-1',
            timestamp: '2026-05-11T16:00:12.000Z',
        },
    };

    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows: [durableReplyRow(), nextRunNarration],
    });

    const turnEntries = entries.filter((entry) => entry.kind === 'turn');
    expect(turnEntries).toHaveLength(2);
    expect(turnEntries[0]?.items).toHaveLength(1);
    expect(turnEntries[1]?.items).toHaveLength(1);
});

test('buildTranscriptEntries keeps runtime notices as standalone system entries', () => {
    const rows: ChatRow[] = [
        toolRow('tool-1', false, false),
        runtimeNoticeRow('notice-1'),
        agentMessage('agent-1', 'Done.', false, false),
    ];

    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows,
    });

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ kind: 'turn', participant: 'agent' });
    expect(entries[1]).toMatchObject({ id: 'notice-1', kind: 'system' });
    expect(entries[2]).toMatchObject({ kind: 'turn', participant: 'agent' });
});

test('run-matched attachments join the live contribution', () => {
    const liveTool = { ...toolRow('tool-1', false, false), runId: 'run-1' } as ChatRow;
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: true,
                runId: 'run-1',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: 'Working...',
            },
        ],
        rows: [liveTool],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'turn:run-1', kind: 'turn', participant: 'agent' });

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(
        entries[0].items.map((item) => (item.kind === 'row' ? item.row.kind : item.kind))
    ).toEqual(['activeReply', 'tool']);
});

test('buildTranscriptEntries hides active reply when a stopped row is visible', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: false,
                runId: 'run-1',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: 'Partial answer',
            },
        ],
        rows: [turnStatusRow('stop-1')],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'turn', participant: 'agent' });

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(entries[0].items.map((item) => (item.kind === 'row' ? item.row.id : item.kind))).toEqual(
        ['stop-1']
    );
});

test('buildTranscriptEntries shows thinking status without a generic activity block', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: true,
                runId: 'run-1',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: '',
            },
        ],
        rows: [],
    });

    expect(entries).toHaveLength(1);

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(entries[0].items.map((item) => item.kind)).toEqual(['activeStatus']);
    expect(entries[0].items[0]).toMatchObject({
        kind: 'activeStatus',
        status: 'thinking',
    });
});

test('buildTranscriptEntries keeps empty non-thinking replies in thinking status', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: false,
                runId: 'run-1',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: '',
            },
        ],
        rows: [],
    });

    expect(entries).toHaveLength(1);

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(entries[0].items.map((item) => item.kind)).toEqual(['activeStatus']);
    expect(entries[0].items[0]).toMatchObject({
        kind: 'activeStatus',
        status: 'thinking',
    });
});

test('a streaming post anchors the turn and suppresses the live overlay', () => {
    // createPost/editPost: the runtime writes the turn's message row at first
    // narration; the pane renders that row, not a live overlay.
    const post = withRunId(
        agentMessage('msg_run-1_assistant', 'Checking the queue.', false, false),
        'run-1'
    );

    if (post.kind !== 'message') {
        throw new Error('Expected message row.');
    }

    const streamingPost: ChatRow = {
        ...post,
        message: {
            ...post.message,
            metadata: { runtime: { runId: 'run-1', streaming: true } },
        },
    };
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: true,
                runId: 'run-1',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: 'Checking the queue.',
            },
        ],
        rows: [streamingPost],
    });

    expect(entries).toHaveLength(1);

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(entries[0].id).toBe('turn:run-1');
    expect(
        entries[0].items.map((item) => (item.kind === 'row' ? item.row.kind : item.kind))
    ).toEqual(['message']);
});

test('an empty reply keeps its own thinking-status entry beside other turns', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agent-1',
                isThinking: true,
                runId: 'run-2',
                sessionKey: 'session-1',
                startedAt: '2026-05-11T16:00:10.000Z',
                text: '',
            },
        ],
        rows: [withResponseId(agentMessage('agent-1', 'Earlier reply.', false, false), 'rsp_1')],
    });

    const agentTurns = entries.filter(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    expect(agentTurns.map((entry) => entry.id)).toEqual(['turn:rsp_1', 'turn:run-2']);

    if (agentTurns[1]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    expect(agentTurns[1].items.map((item) => item.kind)).toEqual(['activeStatus']);
});

test('buildTranscriptEntries keeps widgets inline inside the agent turn', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows: [
            withResponseId(widgetRow('ui-1'), 'rsp_1'),
            withResponseId(agentMessage('agent-1', 'Here is the chart.', false, false), 'rsp_1'),
        ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'turn', participant: 'agent' });

    if (entries[0]?.kind !== 'turn') {
        throw new Error('Expected agent turn entry.');
    }

    // The widget is part of the contribution and renders below the reply.
    expect(
        entries[0].items.map((item) => (item.kind === 'row' ? item.row.kind : item.kind))
    ).toEqual(['message', 'widget']);
});

test('buildTranscriptEntries splits agent turns by response identity over gap heuristics', () => {
    const rows: ChatRow[] = [
        withResponseId(toolRow('tool-1', false, false), 'rsp_1'),
        withResponseId(agentMessage('agent-1', 'First reply.', false, false), 'rsp_1'),
        // Same actor, same session, same timestamps — only the response id
        // says this is a different turn.
        withResponseId(toolRow('tool-2', false, false), 'rsp_2'),
        withResponseId(agentMessage('agent-2', 'Second reply.', false, false), 'rsp_2'),
    ];

    const entries = buildTranscriptEntries({ activeReplies: [], rows });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'turn:rsp_1', kind: 'turn', participant: 'agent' });
    expect(entries[1]).toMatchObject({ id: 'turn:rsp_2', kind: 'turn', participant: 'agent' });
});

test('buildTranscriptEntries keeps one response together across long gaps', () => {
    const lateReply = withResponseId(agentMessage('agent-1', 'Done late.', false, false), 'rsp_1');

    if (lateReply.kind !== 'message') {
        throw new Error('Expected message row.');
    }

    const rows: ChatRow[] = [
        withResponseId(toolRow('tool-1', false, false), 'rsp_1'),
        {
            ...lateReply,
            message: {
                ...lateReply.message,
                // Far beyond the 5-minute grouping gap.
                timestamp: '2026-05-11T17:30:00.000Z',
            },
        },
    ];

    const entries = buildTranscriptEntries({ activeReplies: [], rows });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'turn:rsp_1', kind: 'turn', participant: 'agent' });
});

function withResponseId(row: ChatRow, responseId: string): ChatRow {
    if (!(row.kind === 'message' || row.kind === 'tool' || row.kind === 'widget')) {
        throw new Error('Expected a message, tool, or widget row.');
    }

    return { ...row, responseId };
}

function userMessage(
    id: string,
    content: string,
    connectsToPrevious: boolean,
    connectsToNext: boolean
): ChatRow {
    return {
        actor: null,
        connectsToNext,
        connectsToPrevious,
        id,
        isFirstInGroup: !connectsToPrevious,
        kind: 'message',
        message: {
            actor: null,
            content,
            id,
            sender: 'You',
            senderType: 'user',
            sourceSessionId: null,
            sourceSessionKey: 'session-1',
            timestamp: '2026-05-11T16:00:00.000Z',
        },
    };
}

function agentMessage(
    id: string,
    content: string,
    connectsToPrevious: boolean,
    connectsToNext: boolean
): ChatRow {
    return {
        actor: { id: 'agent-1', kind: 'agent' },
        connectsToNext,
        connectsToPrevious,
        id,
        isFirstInGroup: !connectsToPrevious,
        kind: 'message',
        message: {
            hausAgentId: 'agent-1',
            content,
            id,
            sender: 'Agent',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: 'session-1',
            timestamp: '2026-05-11T16:00:02.000Z',
        },
    };
}

function toolRow(
    id: string,
    connectsToPrevious: boolean,
    connectsToNext: boolean,
    actor: ToolChatRow['actor'] = { id: 'agent-1', kind: 'agent' }
): ChatRow {
    return {
        actor,
        completedAt: '2026-05-11T16:00:05.000Z',
        connectsToNext,
        connectsToPrevious,
        id,
        isFirstInGroup: !connectsToPrevious,
        kind: 'tool',
        sessionKey: 'session-1',
        spawnedRelationships: [],
        startedAt: '2026-05-11T16:00:01.000Z',
        toolCall: {
            callId: 'call-1',
            facts: [],
            label: 'command -v gog',
            name: 'exec',
            status: 'running',
            summaryParts: ['command -v gog'],
        },
    };
}

function widgetRow(id: string): ChatRow {
    return {
        actor: { id: 'agent-1', kind: 'agent' },
        completedAt: '2026-05-11T16:00:05.000Z',
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'widget',
        widget: {
            component: 'haus.widget.bar-chart',
            fallbackText: 'Quarterly Revenue',
            id,
            props: {
                data: [{ quarter: 'Q1', revenue: 12_000 }],
                series: [{ key: 'revenue', label: 'Revenue' }],
                title: 'Quarterly Revenue',
                xKey: 'quarter',
            },
            target: 'chat.inline',
            validationError: null,
        },
        sessionKey: 'session-1',
        startedAt: '2026-05-11T16:00:01.000Z',
    };
}

function runtimeNoticeRow(id: string): ChatRow {
    return {
        id,
        kind: 'system',
        runtimeNotice: {
            agentId: null,
            detail: 'd348a369-223c-42a7-8220-67c7340810c2',
            kind: 'new_session',
            sessionId: 'd348a369-223c-42a7-8220-67c7340810c2',
            text: 'New session: d348a369-223c-42a7-8220-67c7340810c2',
            title: 'Started new session',
        },
        systemKind: 'runtimeNotice',
        timestamp: '2026-05-11T16:00:01.500Z',
    };
}

function turnStatusRow(id: string): ChatRow {
    return {
        id,
        kind: 'system',
        responseId: 'response-1',
        systemKind: 'turnStatus',
        timestamp: '2026-05-11T16:00:02.000Z',
        turnStatus: {
            agentId: 'agent-1',
            runId: 'run-1',
            sessionKey: 'session-1',
            status: 'stopped',
            text: 'Agent response stopped.',
        },
    };
}

const handoffRunId = 'run_handoff';
const handoffSession = 'session-1';

function handoffReply(text: string, isThinking = false) {
    return {
        agentId: 'agent-1',
        isThinking,
        runId: handoffRunId,
        sessionKey: handoffSession,
        startedAt: '2026-05-11T16:00:00.500Z',
        text,
    };
}

function runNarrationMessage(id: string, timestamp: string): ChatRow {
    return {
        actor: { id: 'agent-1', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor: { id: 'agent-1', kind: 'agent' },
            content: 'Tool call 1: weather check.',
            id,
            metadata: { runtime: { runId: handoffRunId, sessionKey: handoffSession } },
            sender: 'Agent',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: handoffSession,
            hausAgentId: 'agent-1',
            timestamp,
        },
    };
}

function durableReplyRow(): ChatRow {
    return {
        actor: { id: 'agent-1', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id: 'message-final',
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor: { id: 'agent-1', kind: 'agent' },
            content: 'Done. Clouds check the window,',
            id: 'message-final',
            metadata: { runtime: { runId: handoffRunId, sessionKey: handoffSession } },
            sender: 'Agent',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: handoffSession,
            hausAgentId: 'agent-1',
            timestamp: '2026-05-11T16:00:11.000Z',
        },
    };
}

function runThinkingRow(text: string): ChatRow {
    const id = `act_${handoffRunId}_thinking_1`;

    return {
        id,
        kind: 'system',
        systemKind: 'thinking',
        thinking: {
            id,
            messageId: handoffRunId,
            sender: 'Agent',
            text,
            timestamp: '2026-05-11T16:00:10.000Z',
        },
        timestamp: '2026-05-11T16:00:10.000Z',
    };
}

test('agent turn entries keep one run-stable id from live streaming to durable rows', () => {
    const streamingOnly = buildTranscriptEntries({
        activeReplies: [handoffReply('', true)],
        rows: [userMessage('message-user', 'hi', false, false)],
    });
    const withWork = buildTranscriptEntries({
        activeReplies: [handoffReply('', true)],
        rows: [
            userMessage('message-user', 'hi', false, false),
            runNarrationMessage('act_run_handoff_message_1', '2026-05-11T16:00:01.000Z'),
            { ...toolRow('act_run_handoff_tool_1', false, false), runId: handoffRunId } as ChatRow,
        ],
    });
    const settled = buildTranscriptEntries({
        activeReplies: [],
        rows: [
            userMessage('message-user', 'hi', false, false),
            runNarrationMessage('act_run_handoff_message_1', '2026-05-11T16:00:01.000Z'),
            { ...toolRow('act_run_handoff_tool_1', false, false), runId: handoffRunId } as ChatRow,
            durableReplyRow(),
        ],
    });

    const ids = [streamingOnly, withWork, settled].map(
        (entries) =>
            entries.find((entry) => entry.kind === 'turn' && entry.participant === 'agent')?.id
    );

    expect(ids).toEqual([`turn:${handoffRunId}`, `turn:${handoffRunId}`, `turn:${handoffRunId}`]);
});

test('the live reply item is suppressed once the durable reply row lands', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [handoffReply('Done. Clouds check the window,')],
        rows: [
            userMessage('message-user', 'hi', false, false),
            runNarrationMessage('act_run_handoff_message_1', '2026-05-11T16:00:01.000Z'),
            durableReplyRow(),
        ],
    });
    const agentTurn = entries.find(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    const itemKinds = agentTurn?.kind === 'turn' ? agentTurn.items.map((item) => item.kind) : [];

    expect(itemKinds.filter((kind) => kind === 'activeReply')).toHaveLength(0);
});

test('duplicate thinking text is hidden when it matches the active reply', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [handoffReply('Done. Clouds check the window,')],
        rows: [runThinkingRow('Done. Clouds')],
    });
    const agentTurn = entries.find(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    const itemLabels =
        agentTurn?.kind === 'turn'
            ? agentTurn.items.map((item) =>
                  item.kind === 'row' && item.row.kind === 'system'
                      ? `${item.row.kind}:${item.row.systemKind}`
                      : item.kind === 'row'
                        ? item.row.kind
                        : item.kind
              )
            : [];

    expect(itemLabels).toEqual(['activeReply']);
});

test('duplicate thinking text is hidden when it matches the durable reply', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows: [runThinkingRow('Done. Clouds'), durableReplyRow()],
    });
    const agentTurn = entries.find(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    const itemLabels =
        agentTurn?.kind === 'turn'
            ? agentTurn.items.map((item) =>
                  item.kind === 'row' && item.row.kind === 'system'
                      ? `${item.row.kind}:${item.row.systemKind}`
                      : item.kind === 'row'
                        ? item.row.kind
                        : item.kind
              )
            : [];

    expect(itemLabels).toEqual(['message']);
});

test('agent turns split by a runtime notice keep unique entry ids', () => {
    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows: [
            runNarrationMessage('act_run_handoff_message_1', '2026-05-11T16:00:01.000Z'),
            runtimeNoticeRow('notice-1'),
            runNarrationMessage('act_run_handoff_message_2', '2026-05-11T16:00:08.000Z'),
        ],
    });
    const turnIds = entries.filter((entry) => entry.kind === 'turn').map((entry) => entry.id);

    expect(new Set(turnIds).size).toBe(turnIds.length);
});

test('a crossing completion never inserts above an earlier live contribution', () => {
    // Otto's seat started first and is still streaming; Wren started later
    // but finished first. Wren's durable reply must land below Otto's live
    // bubble — where Wren's own bubble already was — not above it.
    const wrenReply = {
        actor: { id: 'agt_wren', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id: 'msg_wren_reply',
        isFirstInGroup: true,
        kind: 'message',
        runId: 'run_wren',
        message: {
            content: 'Two items stand out.',
            id: 'msg_wren_reply',
            metadata: {
                runtime: { runId: 'run_wren', startedAt: '2026-05-11T16:00:01.000Z' },
            },
            sender: 'Wren',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: 'ses_wren',
            hausAgentId: 'agt_wren',
            // Completed while Otto is still streaming.
            timestamp: '2026-05-11T16:00:12.000Z',
        },
    } as ChatRow;

    const entries = buildTranscriptEntries({
        activeReplies: [
            {
                agentId: 'agt_otto',
                isThinking: true,
                runId: 'run_otto',
                sessionKey: 'ses_otto',
                startedAt: '2026-05-11T16:00:00.000Z',
                text: 'Still looking around.',
            },
        ],
        rows: [wrenReply],
    });

    const agentTurns = entries.filter(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    expect(agentTurns.map((entry) => entry.id)).toEqual(['turn:run_otto', 'turn:run_wren']);
});

test('interleaved multi-agent rows keep one comment per turn', () => {
    // The original ghost-row bug: two seats streaming at once interleave
    // their rows. Each turn must still map to exactly one entry.
    const widgetA = { ...widgetRow('act_a_widget'), runId: 'run_a' } as ChatRow;
    const widgetB = { ...widgetRow('act_b_widget'), runId: 'run_b' } as ChatRow;
    const replyA = withRunId(agentMessage('msg_a', 'Reply A.', false, false), 'run_a');
    const replyB = withRunId(agentMessage('msg_b', 'Reply B.', false, false), 'run_b');

    const entries = buildTranscriptEntries({
        activeReplies: [],
        rows: [widgetA, widgetB, replyA, replyB],
    });

    const agentTurns = entries.filter(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    expect(agentTurns.map((entry) => entry.id)).toEqual(['turn:run_a', 'turn:run_b']);

    for (const entry of agentTurns) {
        if (entry.kind !== 'turn') {
            throw new Error('Expected agent turn entry.');
        }

        expect(
            entry.items.map((item) => (item.kind === 'row' ? item.row.kind : item.kind))
        ).toEqual(['message', 'widget']);
    }
});

function withRunId(row: ChatRow, runId: string): ChatRow {
    if (row.kind !== 'message') {
        throw new Error('Expected a message row.');
    }

    return { ...row, runId };
}

test('suffixed per-agent run ids keep one turn identity across live and durable rows', () => {
    const runId = 'run_0198f00d-1111-4222-8333-444455556666_blippy';
    const rows = [
        {
            actor: { id: 'agt_blippy', kind: 'agent' },
            completedAt: null,
            connectsToNext: false,
            connectsToPrevious: false,
            id: `act_${runId}_tool_call1`,
            isFirstInGroup: true,
            kind: 'tool',
            runId,
            sessionKey: 'ses_1',
            spawnedRelationships: [],
            startedAt: '2026-07-07T12:00:01.000Z',
            toolCall: {
                callId: 'call1',
                facts: [],
                label: 'ls',
                name: 'bash',
                status: 'running',
                summaryParts: ['ls'],
            },
        },
        {
            actor: { id: 'agt_blippy', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'msg_reply',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                content: 'Done.',
                id: 'msg_reply',
                metadata: { runtime: { runId } },
                sender: 'Blippy',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'ses_1',
                hausAgentId: 'agt_blippy',
                timestamp: '2026-07-07T12:00:05.000Z',
            },
        },
    ] as unknown as TranscriptRow[];

    const items = rows.map((row) => ({ kind: 'row' as const, row }));
    expect(items.map((item) => getItemRunId(item))).toEqual([runId, runId]);

    const entries = buildTranscriptEntries({ activeReplies: [], rows });
    const agentTurns = entries.filter(
        (entry) => entry.kind === 'turn' && entry.participant === 'agent'
    );
    expect(agentTurns).toHaveLength(1);
    expect(agentTurns[0]?.id).toBe(`turn:${runId}`);
});

test('server-provided runId on tool rows wins over id derivation', () => {
    const item = {
        kind: 'row' as const,
        row: {
            actor: { id: 'agt_blippy', kind: 'agent' },
            completedAt: null,
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'act_opaque_row_id',
            isFirstInGroup: true,
            kind: 'tool',
            runId: 'run_from_server_metadata',
            sessionKey: 'ses_1',
            spawnedRelationships: [],
            startedAt: '2026-07-07T12:00:01.000Z',
            toolCall: {
                callId: 'call1',
                facts: [],
                label: 'ls',
                name: 'bash',
                status: 'running',
                summaryParts: ['ls'],
            },
        } as unknown as TranscriptRow,
    };

    expect(getItemRunId(item)).toBe('run_from_server_metadata');
});
