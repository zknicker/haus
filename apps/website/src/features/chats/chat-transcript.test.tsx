import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
    MessageScroller,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../../components/chats/message-scroller.tsx';
import { DevModeProvider } from '../../components/dev-mode-provider.tsx';
import { ArtifactLogEntry } from '../sessions/log/event-entry/artifact-entry.tsx';
import { ChatTranscriptPresentation } from './chat-transcript.tsx';
import { groupAgentItems } from './chat-transcript-item-utils.ts';
import type { TranscriptRow } from './chat-transcript-model.ts';
import type { TranscriptRenderContextValue } from './chat-transcript-render-context.tsx';
import { SystemStep } from './chat-transcript-system-step.tsx';
import { filterPaneSegments, getActiveReplyDisplayText } from './chat-transcript-turn.tsx';
import { resolveMentionAgentId } from './chat-transcript-turn-header.tsx';
import { withLocalTimelineMessageMetadata } from './local-timeline-message.ts';
import { ToolStep } from './tool-steps/registry.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

test('ChatTranscript renders hover time and copy action without session or usage badges', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-1',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Investigating the issue now.',
                id: 'message-1',
                metadata: {
                    model: 'openrouter/anthropic/claude-3.7-sonnet',
                    usage: {
                        cacheRead: 28_672,
                        input: 524,
                        output: 35,
                        total: 29_231,
                    },
                },
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: 'session-9f83ac',
                sourceSessionKey: 'agent:tiny:discord:channel:session-9f83ac',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
        },
    ]);

    assert.doesNotMatch(markup, /claude-3\.7-sonnet/);
    assert.doesNotMatch(markup, /in 524/);
    assert.doesNotMatch(markup, /cached 29k/);
    assert.doesNotMatch(markup, /total 29k/);
    assert.match(markup, /data-slot="message-scroller"/);
    assert.match(markup, /data-slot="message-scroller-item"/);
    assert.match(markup, /data-slot="chat-message-content"/);
    assert.doesNotMatch(markup, /opacity:0;transform/);
    assert.match(markup, /aria-label="Copy message"/);
    assert.doesNotMatch(markup, /aria-label="View session"/);
    assert.doesNotMatch(markup, /Agent idle/);
    assert.doesNotMatch(markup, /aria-label="Collapse message"/);
    assert.doesNotMatch(markup, /session 9f83ac/);
});

test('ChatTranscript mutes deleted authors and labels their historical messages', () => {
    const rows: ChatRow[] = [
        {
            actor: { id: 'agent-deleted', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-deleted',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'agent-deleted',
                content: 'This history stays readable.',
                id: 'message-deleted',
                sender: 'Cove',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'hosted:agent-deleted',
                timestamp: '2026-08-10T16:00:00.000Z',
            },
        },
    ];
    const markup = renderTranscript(rows, {
        chatId: 'chat-history',
        composerId: 'chat-history',
        resolveActorProfile: (actor) =>
            actor?.kind === 'agent'
                ? {
                      avatarUrl: '/avatars/cove.png',
                      deleted: true,
                      id: actor.id,
                      isSelf: false,
                      kind: 'agent',
                      name: 'Cove',
                      availability: { kind: 'none' },
                  }
                : null,
    });

    assert.match(markup, />DELETED</);
    assert.match(markup, /opacity-50 grayscale/);
    assert.match(markup, /text-muted/);
    assert.doesNotMatch(markup, /Mention Cove/);
    assert.doesNotMatch(markup, /Agent details: Cove/);
});

test('ChatTranscript bleeds message rows to both detail lane edges', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-1',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Using the available width.',
                id: 'message-1',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: 'session-1',
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-07-01T18:00:00.000Z',
            },
        },
    ]);

    assert.match(markup, /relative min-h-full w-full/);
    assert.match(markup, /w-\[calc\(100%\+var\(--spacing\)\*10\)\]/);
});

test('archived transcripts render agent names without mention actions', () => {
    assert.equal(resolveMentionAgentId('agent-1', 'agent', false), undefined);
    assert.equal(resolveMentionAgentId('agent-1', 'agent', true), 'agent-1');
});

test('ChatTranscript animates only local optimistic user messages', () => {
    const localTimeline: ChatRow[] = [
        {
            actor: { id: 'usr_haus', kind: 'participant' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'msg-local',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                content: 'Can you check this?',
                id: 'msg-local',
                metadata: withLocalTimelineMessageMetadata(),
                sender: 'You',
                senderType: 'user',
                sourceSessionKey: '',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
        },
    ];
    const markup = renderTranscript(localTimeline);

    assert.match(markup, /Can you check this\?/);
    assert.match(markup, /data-slot="chat-message-assistant"/);
    assert.match(markup, /data-slot="pending-chat-message"/);
    assert.doesNotMatch(markup, /aria-label="Copy message"/);
    // Every message shares the left roster; the optimistic row still animates.
    assert.match(markup, /style="transform-origin:bottom left;opacity:0;transform/);
});

test('ChatTranscript renders chat markdown headings and inline markup in message text', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-markdown',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content:
                    '# Test\n\n## Test 2\n\n### Test 3\nI use **gpt-5.4-mini**, *carefully*, with `OPENAI_API_KEY`, [OpenAI](https://openai.com), www.example.com, <u>raw</u>, and [bad](javascript:alert(1)).',
                id: 'message-markdown',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: '',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
        },
    ]);

    assert.match(markup, /<h1>Test<\/h1>/);
    assert.match(markup, /<h2>Test 2<\/h2>/);
    assert.match(markup, /<h3>Test 3<\/h3>/);
    assert.match(markup, /<strong>gpt-5\.4-mini<\/strong>/);
    assert.match(markup, /<em>carefully<\/em>/);
    assert.match(markup, /<code class="markdown__inline-code"[^>]*>OPENAI_API_KEY<\/code>/);
    assert.match(markup, /href="https:\/\/openai\.com\/"/);
    assert.match(markup, /href="http:\/\/www\.example\.com\/"/);
    assert.match(markup, /title="OpenAI"/);
    assert.match(markup, /title="www\.example\.com"/);
    assert.match(markup, /favicon\.ico/);
    assert.match(markup, /&lt;u&gt;raw&lt;\/u&gt;/);
    assert.doesNotMatch(markup, /# Test/);
    assert.doesNotMatch(markup, /href="javascript:/);
});

test('ChatTranscript renders image attachments in a fluid media frame', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'profile-1', kind: 'participant' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-image',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: null,
                attachments: [
                    {
                        dataBase64: 'iVBORw0KGgo=',
                        filename: 'screenshot.png',
                        height: 768,
                        mediaType: 'image/png',
                        sizeBytes: 12_345,
                        type: 'inline',
                        width: 1024,
                    },
                ],
                content: 'Can you inspect this?',
                id: 'message-image',
                sender: 'You',
                senderType: 'user',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
        },
    ]);

    assert.match(markup, /aria-label="Open screenshot\.png"/);
    assert.match(markup, /size-16/);
    assert.doesNotMatch(markup, /bg-surface-2/);
    assert.doesNotMatch(markup, /File reference/);
});

test('ChatTranscript renders loaded multiline assistant replies as one message block', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-multiline',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'First line.\nSecond line.\nThird line.',
                id: 'message-multiline',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
        },
    ]);

    assert.match(markup, /First line\./);
    assert.match(markup, /Second line\./);
    assert.match(markup, /Third line\./);
    assert.match(markup, /data-slot="chat-message-assistant"/);
    assert.match(markup, /data-slot="chat-message-content"/);
    assert.doesNotMatch(markup, /chat-streaming-text-unit/);
});

test('active reply display text ignores invisible streaming edge whitespace', () => {
    assert.equal(getActiveReplyDisplayText('\n\nDone.\n\n'), 'Done.');
});

test('ChatTranscript keeps tool calls out of the chat pane', () => {
    const rows: ChatRow[] = [
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:00:01.000Z',
            connectsToNext: true,
            connectsToPrevious: false,
            id: 'tool-1',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:00.000Z',
            toolCall: {
                callId: 'call-1',
                facts: [],
                label: 'command -v gog',
                name: 'exec',
                status: 'running',
                summaryParts: ['command -v gog'],
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: true,
            id: 'message-2',
            isFirstInGroup: false,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Done.',
                id: 'message-2',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:01.000Z',
            },
        },
    ];
    const markup = renderTranscript(rows);

    assert.match(markup, /Done\./);
    assert.doesNotMatch(markup, /Worked/);
    assert.doesNotMatch(markup, /Agent idle/);
    // The pane is prose-only; tool work renders in the turn drawer instead.
    // Message actions (reaction popover) legitimately ship a collapsed
    // aria-expanded, so only an expanded work group is disqualifying.
    assert.doesNotMatch(markup, /aria-expanded="true"/);
    assert.doesNotMatch(markup, /command -v gog/);
});

test('ChatTranscript labels recovered tool failures without making the final reply look failed', () => {
    const rows: ChatRow[] = [
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:00:01.000Z',
            connectsToNext: true,
            connectsToPrevious: false,
            id: 'tool-failed-read',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:00.000Z',
            toolCall: {
                callId: 'call-failed-read',
                facts: [{ label: 'Error', tone: 'danger', value: 'HTTP 400' }],
                label: 'read · bad-upload.png',
                name: 'read_file',
                status: 'error',
                summaryParts: ['bad-upload.png'],
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:00:02.000Z',
            connectsToNext: true,
            connectsToPrevious: true,
            id: 'tool-success-write',
            isFirstInGroup: false,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:01.000Z',
            toolCall: {
                callId: 'call-success-write',
                facts: [],
                label: 'write · Memory/Notes.md',
                name: 'write_file',
                status: 'ok',
                summaryParts: ['Memory/Notes.md'],
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: true,
            id: 'message-recovered',
            isFirstInGroup: false,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Done.',
                id: 'message-recovered',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:03.000Z',
            },
        },
    ];
    const markup = renderTranscript(rows);

    assert.match(markup, /Done\./);
    assert.doesNotMatch(markup, /Final reply failed/);
    assert.doesNotMatch(markup, /Recovered after failed file read/);
});

test('ChatTranscript replays retired catalog widgets as the fallback card', () => {
    const markup = renderTranscript([widgetRow('ui-chart')]);

    assert.match(markup, /Quarterly Revenue/);
    assert.match(markup, /Widget unavailable/);
    assert.doesNotMatch(markup, /\$15,500/);
    assert.doesNotMatch(markup, /<iframe/);
});
test('ChatTranscript renders visual widget rows in a sandboxed iframe', () => {
    const row = widgetRow('ui-visual');

    if (row.kind !== 'widget') {
        throw new Error('Expected widget row.');
    }

    const markup = renderTranscript([
        {
            ...row,
            widget: {
                ...row.widget,
                component: 'haus.widget.visual',
                fallbackText: 'Weekly sales',
                props: {
                    html: '<h1>Weekly sales</h1><svg viewBox="0 0 10 10"></svg>',
                    title: 'Weekly sales',
                },
            },
        },
    ]);

    assert.match(markup, /<iframe/);
    assert.match(
        markup,
        /sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"/
    );
    assert.doesNotMatch(markup, /allow-same-origin/);
    assert.match(markup, /Content-Security-Policy/);
    assert.doesNotMatch(markup, /Widget unavailable/);
});

test('ChatTranscript renders durable message ```visual fences as visual cards', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-visual',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Here is the chart.\n```visual Weekly sales\n<h1>Weekly sales</h1>\n```',
                id: 'message-visual',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:03.000Z',
            },
        },
    ]);

    assert.match(markup, /Here is the chart\./);
    assert.match(markup, /<iframe/);
    assert.doesNotMatch(markup, /```visual/);
    assert.doesNotMatch(markup, /allow-same-origin/);
});

test('ChatTranscript renders artifact widgets as compact open-in-pane cards', () => {
    const row = widgetRow('ui-artifact');

    if (row.kind !== 'widget') {
        throw new Error('Expected widget row.');
    }

    const markup = renderTranscript([
        {
            ...row,
            widget: {
                ...row.widget,
                component: 'haus.widget.artifact',
                fallbackText: 'Fleet status',
                props: {
                    path: 'workbench/pages/fleet.html',
                    title: 'Fleet status',
                },
            },
        },
    ]);

    // The card never renders the page inline: no iframe, no workspace read —
    // just the title, kind line, and the open affordance.
    assert.match(markup, /Fleet status/);
    assert.match(markup, /Page · workbench\/pages\/fleet\.html/);
    assert.match(markup, /Open/);
    assert.doesNotMatch(markup, /<iframe/);
    assert.doesNotMatch(markup, /Widget unavailable/);
});

test('ChatTranscript renders fallback for invalid widgets', () => {
    const row = widgetRow('ui-invalid');

    if (row.kind !== 'widget') {
        throw new Error('Expected widget row.');
    }

    const markup = renderTranscript([
        {
            ...row,
            widget: {
                ...row.widget,
                props: { data: [] },
                validationError: 'Invalid widget payload.',
            },
        },
    ]);

    assert.match(markup, /Quarterly Revenue/);
    assert.match(markup, /Widget unavailable/);
});

test('ChatTranscript renders fallback when widget props do not match the component', () => {
    const row = widgetRow('ui-mismatched-table');

    if (row.kind !== 'widget') {
        throw new Error('Expected widget row.');
    }

    const markup = renderTranscript([
        {
            ...row,
            widget: {
                ...row.widget,
                component: 'haus.widget.table',
                fallbackText: 'Top states',
                props: {
                    data: [{ state: 'California' }],
                    series: [{ key: 'state', label: 'State' }],
                    title: 'Top states',
                    xKey: 'state',
                },
            },
        },
    ]);

    assert.match(markup, /Top states/);
    assert.match(markup, /Widget unavailable/);
    assert.doesNotMatch(markup, /California/);
});

test('ChatTranscript renders fallback for unknown widget components', () => {
    const row = widgetRow('ui-unknown');

    if (row.kind !== 'widget') {
        throw new Error('Expected widget row.');
    }

    const markup = renderTranscript([
        {
            ...row,
            widget: {
                ...row.widget,
                component: 'haus.unknown',
            },
        },
    ]);

    assert.match(markup, /Quarterly Revenue/);
    assert.match(markup, /Widget unavailable/);
});

test('ChatTranscript keeps reasoning out of the chat pane', () => {
    const rows: ChatRow[] = [
        {
            id: 'thinking-1',
            kind: 'system',
            systemKind: 'thinking',
            thinking: {
                id: 'thinking-1',
                messageId: 'response-1',
                sender: 'tiny',
                text: 'I should greet the user directly.',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
            timestamp: '2026-03-31T15:00:00.000Z',
        },
    ];

    // Reasoning belongs to the turn trace alongside tool work, not the chat
    // transcript.
    assert.doesNotMatch(renderTranscript(rows), /I should greet the user directly\./);
});

test('ChatTranscript keeps active thinking out of the chat pane', () => {
    const rows: ChatRow[] = [
        {
            id: 'thinking-1',
            kind: 'system',
            systemKind: 'thinking',
            thinking: {
                id: 'thinking-1',
                messageId: 'response-1',
                sender: 'tiny',
                text: '**Reviewing the request** I should inspect the workspace before using a command.',
                timestamp: '2026-03-31T15:00:00.000Z',
            },
            timestamp: '2026-03-31T15:00:00.000Z',
        },
        {
            id: 'thinking-2',
            kind: 'system',
            systemKind: 'thinking',
            thinking: {
                id: 'thinking-2',
                messageId: 'response-1',
                sender: 'tiny',
                text: '**Checking tool output** I should summarize only the command result.',
                timestamp: '2026-03-31T15:00:02.000Z',
            },
            timestamp: '2026-03-31T15:00:02.000Z',
        },
    ];
    const markup = renderTranscript(rows);

    assert.doesNotMatch(markup, /Reviewing the request/);
    assert.doesNotMatch(markup, /Checking tool output/);
});

test('SystemStep uses leading bold thinking text as the thinking step title', () => {
    const markup = renderToStaticMarkup(
        <SystemStep
            index={0}
            isLast
            row={{
                id: 'thinking-1',
                kind: 'system',
                systemKind: 'thinking',
                thinking: {
                    id: 'thinking-1',
                    messageId: 'response-1',
                    sender: 'tiny',
                    text: '**Deciding on greeting approach** It seems I can answer directly.',
                    timestamp: '2026-03-31T15:00:00.000Z',
                },
                timestamp: '2026-03-31T15:00:00.000Z',
            }}
        />
    );

    assert.match(markup, /Deciding on greeting approach/);
    assert.match(markup, /It seems I can answer directly\./);
    assert.doesNotMatch(markup, /\*\*Deciding on greeting approach\*\*/);
    assert.doesNotMatch(markup, /<svg/u);
});

test('ToolStep renders bash failures through the shell tool renderer', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-timeout',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [
                        {
                            label: 'Command',
                            tone: 'default',
                            value: "/bin/zsh -lc 'sleep 5'",
                        },
                        {
                            label: 'Reason',
                            tone: 'danger',
                            value: 'command timed out',
                        },
                    ],
                    label: 'bash · sleep 5',
                    name: 'bash',
                    status: 'timeout',
                    summaryParts: ["/bin/zsh -lc 'sleep 5'"],
                },
            }}
        />
    );

    assert.match(markup, /Timed out/);
    assert.doesNotMatch(markup, /command timed out/);
    assert.doesNotMatch(markup, /Status: timeout/);
    assert.doesNotMatch(markup, />Used</);
});

test('ToolStep renders completed verbs in neutral text and the whole row as the drawer trigger', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-neutral',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [],
                    label: 'bash · date',
                    name: 'bash',
                    status: 'ok',
                    summaryParts: ['date'],
                },
            }}
        />
    );

    assert.doesNotMatch(markup, /text-success/);
    assert.match(markup, /text-muted">Used</);
    assert.match(markup, /<button aria-label="Inspect bash · date"/);
    assert.match(markup, /cursor-default/);
    assert.doesNotMatch(markup, /cursor-pointer/);
    assert.doesNotMatch(markup, /thinking-indicator-text/);
});

test('ToolStep scopes generic failures to the failed tool target', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-read-failed',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [
                        {
                            label: 'Error',
                            tone: 'danger',
                            value: 'HTTP 400: Unsupported content type',
                        },
                    ],
                    label: 'read · bad-upload.png',
                    name: 'read',
                    status: 'error',
                    summaryParts: ['bad-upload.png'],
                },
            }}
        />
    );

    assert.match(markup, />Failed</);
    assert.match(markup, /read bad-upload\.png/);
    assert.doesNotMatch(markup, /Unsupported content type/);
});

test('ToolStep renders terminal rows with the command instead of the tool name', () => {
    const command = 'merchbase sales series --range 10d --bucket day --marketplace US';
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-terminal',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [{ label: 'Command', tone: 'default', value: command }],
                    label: 'terminal',
                    name: 'terminal',
                    status: 'ok',
                    summaryParts: [command],
                },
            }}
        />
    );

    assert.match(markup, />Used</);
    assert.match(markup, /merchbase sales series --range 10d --bucket day --marketplace US/);
    assert.doesNotMatch(markup, />terminal</);
});

test('ToolStep caps long inline tool targets', () => {
    const command =
        'merchbase sales series --range 365d --bucket day --marketplace US --format json --include-orders --debug';
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-terminal-long',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [{ label: 'Command', tone: 'default', value: command }],
                    label: 'terminal',
                    name: 'terminal',
                    status: 'ok',
                    summaryParts: [command],
                },
            }}
        />
    );

    assert.match(
        markup,
        /merchbase sales series --range 365d --bucket day --marketplace US --format json --include-ord/
    );
    assert.match(markup, /\.\.\./);
    assert.doesNotMatch(markup, /--debug/);
});

test('ToolStep shimmers running tool rows like the thinking indicator', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: null,
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-running',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [],
                    label: 'bash · sleep 4',
                    name: 'bash',
                    status: 'running',
                    summaryParts: ['sleep 4'],
                },
            }}
        />
    );

    assert.match(markup, /thinking-indicator-text/);
    assert.match(markup, />Using</);
});

test('ToolStep keeps older tool rows inspectable when call id is missing', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-old',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [],
                    label: 'computer use.list apps',
                    name: 'tool',
                    status: 'completed',
                    summaryParts: ['computer use.list apps'],
                },
            }}
        />
    );

    assert.match(markup, /<button aria-label="Inspect /);
    assert.match(markup, /computer use\.list apps/);
});

test('ToolStep avoids duplicating the tool verb when the activity title already includes it', () => {
    const markup = renderToStaticMarkup(
        <ToolStep
            index={0}
            isLast
            row={{
                actor: { id: 'tiny', kind: 'agent' },
                completedAt: '2026-03-31T15:00:05.000Z',
                connectsToNext: false,
                connectsToPrevious: false,
                id: 'tool-read',
                isFirstInGroup: true,
                kind: 'tool',
                sessionKey: 'agent:tiny:session-1',
                spawnedRelationships: [],
                startedAt: '2026-03-31T15:00:00.000Z',
                toolCall: {
                    callId: null,
                    facts: [],
                    label: 'read from QA_KICKOFF_TASK.md',
                    name: 'read',
                    status: 'completed',
                    summaryParts: ['read from QA_KICKOFF_TASK.md'],
                },
            }}
        />
    );

    assert.match(markup, />Used</);
    assert.match(markup, /read from QA_KICKOFF_TASK\.md/);
    assert.doesNotMatch(markup, /Read read from QA_KICKOFF_TASK\.md/);
});

test('ChatTranscript omits completed activity timing beside transcript rows', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:02:03.000Z',
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'tool-complete',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:00.000Z',
            toolCall: {
                callId: 'call-2',
                facts: [],
                label: 'src/app.tsx',
                name: 'edit',
                status: 'ok',
                summaryParts: ['src/app.tsx'],
            },
        },
    ]);

    assert.doesNotMatch(markup, /Worked for 2 minutes 3 seconds/);
    assert.doesNotMatch(markup, /Agent idle/);
});

test('ArtifactLogEntry renders durable artifact titles', () => {
    const markup = renderToStaticMarkup(
        <ArtifactLogEntry
            entry={{
                artifact: {
                    artifactType: 'document',
                    createdAt: '2026-03-31T15:00:05.000Z',
                    id: 'art-report',
                    mimeType: 'text/markdown',
                    path: 'file:///tmp/report.md',
                    payload: {
                        contentRef: 'file:///tmp/report.md',
                        contentText: '# Report',
                        title: 'Report',
                    },
                },
                id: 'art-report',
                kind: 'system',
                systemKind: 'artifact',
                timestamp: '2026-03-31T15:00:05.000Z',
            }}
        />
    );

    assert.match(markup, /document/);
    assert.match(markup, /Report/);
});

test('ChatTranscript renders durable activity once when an assistant reply follows it', () => {
    const rows: ChatRow[] = [
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:00:04.000Z',
            connectsToNext: true,
            connectsToPrevious: false,
            id: 'tool-complete',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:01.000Z',
            toolCall: {
                callId: 'call-2',
                facts: [],
                label: 'weather',
                name: 'weather',
                status: 'ok',
                summaryParts: ['weather'],
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: true,
            id: 'message-agent',
            isFirstInGroup: false,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'NYC right now: 61F.',
                id: 'message-agent',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:11.000Z',
            },
        },
    ];

    const markup = renderTranscript(rows);

    assert.doesNotMatch(markup, /Worked for/);
    assert.match(markup, /NYC right now: 61F\./);
});

test('ChatTranscript renders runtime notices outside the work disclosure', () => {
    const markup = renderTranscript([
        {
            id: 'runtime-notice-1',
            kind: 'system',
            runtimeNotice: {
                agentId: null,
                detail: 'Compacted the session context.',
                kind: 'status',
                sessionId: null,
                text: 'Compacted the session context.',
                title: 'Context status',
            },
            systemKind: 'runtimeNotice',
            timestamp: '2026-03-31T15:00:00.000Z',
        },
    ]);

    assert.match(markup, /Context status/);
    assert.match(markup, /data-testid="runtime-notice-trigger"/);
    assert.doesNotMatch(markup, /Working/);
    assert.doesNotMatch(markup, /Worked/);
});

test('ChatTranscript attaches a new-session notice to the turn that opened it', () => {
    const markup = renderTranscript([
        {
            id: 'runtime-notice-1',
            kind: 'system',
            runtimeNotice: {
                agentId: 'tiny',
                detail: 'd348a369-223c-42a7-8220-67c7340810c2',
                kind: 'new_session',
                sessionId: 'd348a369-223c-42a7-8220-67c7340810c2',
                text: 'New session: d348a369-223c-42a7-8220-67c7340810c2',
                title: 'Started new session',
            },
            systemKind: 'runtimeNotice',
            timestamp: '2026-03-31T15:00:00.000Z',
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-session-open',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                content: 'Fresh context, ready to go.',
                id: 'message-session-open',
                metadata: {},
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'session-fresh',
                hausAgentId: 'tiny',
                timestamp: '2026-03-31T15:00:05.000Z',
            },
        },
    ]);

    // No standalone notice row ahead of the reply — the turn's header carries
    // the session affordance instead.
    assert.doesNotMatch(markup, /Started new session/);
    assert.match(markup, /aria-label="Started a fresh session"/);
    assert.match(markup, /Fresh context, ready to go\./);
});

test('ChatTranscript renders nothing for a new-session notice with no turn to attach to', () => {
    const markup = renderTranscript([
        {
            id: 'runtime-notice-1',
            kind: 'system',
            runtimeNotice: {
                agentId: 'tiny',
                detail: null,
                kind: 'new_session',
                sessionId: 'session-fresh',
                text: 'New session.',
                title: 'Started new session',
            },
            systemKind: 'runtimeNotice',
            timestamp: '2026-03-31T15:00:00.000Z',
        },
    ]);

    assert.doesNotMatch(markup, /Started new session/);
    assert.doesNotMatch(markup, /aria-label="Started a fresh session"/);
});

test('ChatTranscript hides a stopped turn that produced no visible content', () => {
    const markup = renderTranscript([stoppedTurnRow()]);

    assert.doesNotMatch(markup, /Agent response stopped\./);
});

test('ChatTranscript keeps the stopped note as a muted footnote under turn content', () => {
    const markup = renderTranscript([
        narrationMessageRow(
            'act_run-1_message_0',
            'I was about to check the docs.',
            Date.parse('2026-03-31T14:59:30.000Z')
        ),
        stoppedTurnRow('run-1'),
    ]);

    assert.match(markup, /I was about to check the docs\./);
    assert.match(markup, /Agent response stopped\./);
    // A quiet lifecycle note: the icon inherits the muted text color instead
    // of reading as an error.
    assert.doesNotMatch(markup, /text-error-foreground/);
    assert.doesNotMatch(markup, /<button aria-label="Inspect /);
    assert.doesNotMatch(markup, /Working/);
    assert.doesNotMatch(markup, /Worked/);
});

function stoppedTurnRow(runId = 'run-cancelled'): ChatRow {
    return {
        id: 'response-cancelled:cancelled',
        kind: 'system',
        responseId: 'response-cancelled',
        systemKind: 'turnStatus',
        timestamp: '2026-03-31T15:00:00.000Z',
        turnStatus: {
            agentId: 'tiny',
            runId,
            sessionKey: 'agent:tiny:session-1',
            status: 'stopped',
            text: 'Agent response stopped.',
        },
    };
}

test('ChatTranscript does not keep timing a stopped turn', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: null,
            connectsToNext: true,
            connectsToPrevious: false,
            id: 'act_run-cancelled_tool_1',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:00:05.000Z',
            toolCall: {
                callId: 'call-1',
                facts: [],
                label: 'bash',
                name: 'bash',
                status: 'running',
                summaryParts: ['bash'],
            },
        },
        {
            id: 'response-cancelled:cancelled',
            kind: 'system',
            responseId: 'response-cancelled',
            systemKind: 'turnStatus',
            timestamp: '2026-03-31T15:00:10.000Z',
            turnStatus: {
                agentId: 'tiny',
                runId: 'run-cancelled',
                sessionKey: 'agent:tiny:session-1',
                status: 'stopped',
                text: 'Agent response stopped.',
            },
        },
    ]);

    // Tool work is drawer-only, so a stopped turn with no pane-visible
    // content drops out entirely — including its lifecycle note and timer.
    assert.doesNotMatch(markup, /Agent response stopped\./);
    assert.doesNotMatch(markup, /Agent idle/);
    assert.doesNotMatch(markup, /Ran a command/);
    assert.doesNotMatch(markup, /Working for/);
});

test('ChatTranscript keeps completed agent status out of transcript after activity', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'profile-1', kind: 'participant' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-user',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                hausAgentId: null,
                content: 'Can you try a tool call?',
                id: 'message-user',
                sender: 'You',
                senderType: 'user',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:00:52.000Z',
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            completedAt: '2026-03-31T15:01:00.002Z',
            connectsToNext: true,
            connectsToPrevious: false,
            id: 'tool-complete',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: '2026-03-31T15:01:00.000Z',
            toolCall: {
                callId: 'call-2',
                facts: [],
                label: 'date && pwd',
                name: 'bash',
                status: 'ok',
                summaryParts: ['date && pwd'],
            },
        },
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: true,
            id: 'message-agent',
            isFirstInGroup: false,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'Tool call worked.',
                id: 'message-agent',
                sender: 'Tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: '2026-03-31T15:01:03.000Z',
            },
        },
    ]);

    assert.doesNotMatch(markup, /Worked for 3 seconds/);
    assert.doesNotMatch(markup, /Worked for 1 second/);
    assert.doesNotMatch(markup, /Agent idle/);
});

test('ChatTranscript renders a pending clarification as a read-only question row', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            clarification: {
                answer: null,
                choices: ['Los Angeles', 'San Francisco'],
                deadlineAt: new Date(Date.now() + 60_000).toISOString(),
                disposition: null,
                question: 'Which part of California?',
                requestId: 'clarify_1',
            },
            completedAt: null,
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'act_run-clarify_clarify_1',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: new Date().toISOString(),
            toolCall: {
                callId: null,
                facts: [],
                label: 'Clarification',
                name: 'clarify',
                status: null,
                summaryParts: ['Which part of California?'],
            },
        },
    ]);

    assert.match(markup, /Needs an answer[\s\S]*Which part of California\?/);
    assert.doesNotMatch(markup, /Los Angeles/);
    assert.doesNotMatch(markup, /San Francisco/);
    assert.doesNotMatch(markup, />Other</);
    assert.doesNotMatch(markup, />Skip</);
    assert.doesNotMatch(markup, /Using[\s\S]*Which part of California\?/);
});

test('ChatTranscript renders free-text clarifications as read-only question rows', () => {
    const markup = renderTranscript([
        {
            actor: { id: 'tiny', kind: 'agent' },
            clarification: {
                answer: null,
                choices: [],
                deadlineAt: new Date(Date.now() + 60_000).toISOString(),
                disposition: null,
                question: 'Which city should I use?',
                requestId: 'clarify_text',
            },
            completedAt: null,
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'act_run-clarify_text',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'agent:tiny:session-1',
            spawnedRelationships: [],
            startedAt: new Date().toISOString(),
            toolCall: {
                callId: null,
                facts: [],
                label: 'Clarification',
                name: 'clarify',
                status: null,
                summaryParts: ['Which city should I use?'],
            },
        },
    ]);

    assert.match(markup, /Needs an answer[\s\S]*Which city should I use\?/);
    assert.equal(countMatches(markup, />Answer</g), 0);
    assert.doesNotMatch(markup, />Other</);
});

test('ChatTranscript renders the streaming post as one evolving contribution', () => {
    const runId = 'run_0198f00d-1111-4222-8333-444455556666_blippy';
    const postId = `msg_${runId}_assistant`;
    const post = (content: string, streaming: boolean) =>
        ({
            actor: { id: 'blippy', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: postId,
            isFirstInGroup: true,
            kind: 'message',
            runId,
            message: {
                hausAgentId: 'blippy',
                content,
                id: postId,
                metadata: { runtime: { runId, sessionKey: 'ses_1', streaming } },
                sender: 'blippy',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'ses_1',
                timestamp: '2026-07-07T12:00:01.000Z',
            },
        }) as ChatRow;

    // Mid-turn the post exists as one message and edits in place: exactly one
    // assistant bubble, no duplicate beside it.
    const live = renderTranscript([post('Update: halfway there.', true)]);
    assert.equal(live.match(/data-from="assistant"/g)?.length ?? 0, 1);

    // The finalized post is the same single message.
    const done = renderTranscript([post('All done.', false)]);
    assert.match(done, /All done\./);
    assert.equal(done.match(/data-from="assistant"/g)?.length ?? 0, 1);
});

test('the pane narration slot keeps only the latest update while the turn runs', () => {
    const now = Date.now();
    const segments = filterPaneSegments(
        groupAgentItems([
            {
                kind: 'row',
                row: narrationMessageRow(
                    'act_run-1_message_0',
                    'I will inspect the workspace first.',
                    now - 2000
                ),
            },
            {
                kind: 'row',
                row: narrationMessageRow(
                    'act_run-1_message_1',
                    'The layout matches the map.',
                    now - 1000
                ),
            },
        ])
    );

    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.key, 'narration:run-1');

    const item = segments[0]?.kind === 'item' ? segments[0].item : null;
    assert.ok(item?.kind === 'row' && item.row.kind === 'message');
    assert.equal(item.row.message.content, 'The layout matches the map.');
});

test('the pane keeps changed-files chips standalone while other tool work stays in the drawer', () => {
    const toolRow = (id: string, name: string): ChatRow => ({
        actor: { id: 'tiny', kind: 'agent' },
        completedAt: '2026-03-31T15:00:01.000Z',
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'tool',
        sessionKey: 'agent:tiny:session-1',
        spawnedRelationships: [],
        startedAt: '2026-03-31T15:00:00.000Z',
        toolCall: {
            callId: null,
            facts: [],
            label: name === 'workspace_changes' ? 'Changed 2 files' : name,
            name,
            status: 'completed',
            summaryParts: ['2 files'],
        },
    });

    const segments = filterPaneSegments(
        groupAgentItems([
            { kind: 'row', row: toolRow('act_run-1_tool_1', 'bash') },
            { kind: 'row', row: toolRow('act_run-1_files', 'workspace_changes') },
        ])
    );

    assert.equal(segments.length, 1);
    const segment = segments[0];
    assert.ok(segment?.kind === 'item');
    const item = segment.item;
    assert.ok(item.kind === 'row' && item.row.kind === 'tool');
    assert.equal(item.row.toolCall.name, 'workspace_changes');
    assert.equal(segment.key, 'act_run-1_files');
});

test('the pane drops narration when the run replied in a sibling turn entry', () => {
    const now = Date.now();
    const segments = filterPaneSegments(
        groupAgentItems([
            {
                kind: 'row',
                row: narrationMessageRow(
                    'act_run-1_message_0',
                    'I will inspect the workspace first.',
                    now - 2000
                ),
            },
        ]),
        new Set(['run-1'])
    );

    assert.equal(segments.length, 0);
});

test('ChatTranscript replaces narration with the final reply once it lands', () => {
    const now = Date.now();
    const markup = renderTranscript([
        narrationMessageRow(
            'act_run-1_message_0',
            'I will inspect the workspace first.',
            now - 2000
        ),
        narrationMessageRow('act_run-1_message_1', 'The layout matches the map.', now - 1000),
        {
            actor: { id: 'tiny', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: true,
            id: 'msg_run-1_assistant',
            isFirstInGroup: false,
            kind: 'message',
            message: {
                hausAgentId: 'tiny',
                content: 'The workspace looks well organized.',
                id: 'msg_run-1_assistant',
                metadata: { runtime: { runId: 'run-1', sessionKey: 'agent:tiny:session-1' } },
                sender: 'tiny',
                senderType: 'agent',
                sourceSessionId: null,
                sourceSessionKey: 'agent:tiny:session-1',
                timestamp: new Date(now - 500).toISOString(),
            },
        },
    ]);

    assert.match(markup, /The workspace looks well organized\./);
    assert.doesNotMatch(markup, /I will inspect the workspace first\./);
    assert.doesNotMatch(markup, /The layout matches the map\./);
});

function narrationMessageRow(id: string, content: string, timestampMs: number): ChatRow {
    return {
        actor: { id: 'tiny', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            hausAgentId: 'tiny',
            content,
            id,
            metadata: {
                runtime: {
                    messagePhase: 'commentary',
                    runId: 'run-1',
                    sessionKey: 'agent:tiny:session-1',
                },
            },
            sender: 'tiny',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: 'agent:tiny:session-1',
            timestamp: new Date(timestampMs).toISOString(),
        },
    };
}

test('ChatTranscript marks a message an automation provoked, in the header beside the name', () => {
    const markup = renderTranscript([causedRow()], causedOverrides());

    assert.match(markup, /Deploy finished/);
    assert.match(markup, /text-trigger-mark/);
});

test('ChatTranscript keeps an ordinary Agent header to a name and a time', () => {
    const row = causedRow();
    const markup = renderTranscript(
        [{ ...row, message: { ...row.message, cause: null } }],
        causedOverrides()
    );

    assert.doesNotMatch(markup, /Deploy finished/);
    assert.doesNotMatch(markup, /text-trigger-mark/);
    // No description tagline: what an Agent is generally for belongs to its
    // hover card and profile, not to every message it writes.
    const header = /max-w-full items-center gap-2[^>]*>(.*?)<\/div>/.exec(markup)?.[1] ?? '';
    assert.equal(header.replace(/<[^>]*>/g, ''), 'Blippy12:00 pm');
});

test('ChatTranscript marks a message an Agent wrote after starting a new session', () => {
    const markup = renderTranscript([causedRow()], {
        ...causedOverrides(),
        sessionMarks: new Map([['message-caused', { agentId: 'blippy', generation: 5 }]]),
        turnDetails: { access: 'summary', serverId: 'srv_1' },
    });

    assert.match(markup, /New session/);
    assert.match(markup, /text-session-mark/);
});

test('ChatTranscript orders the session mark after the cause mark when both apply', () => {
    const markup = renderTranscript([causedRow()], {
        ...causedOverrides(),
        sessionMarks: new Map([['message-caused', { agentId: 'blippy', generation: 5 }]]),
        turnDetails: { access: 'summary', serverId: 'srv_1' },
    });

    // Why the Agent spoke comes before what it had already forgotten.
    assert.ok(
        markup.indexOf('message-cause-mark') < markup.indexOf('message-session-mark'),
        'the cause mark should render before the session mark'
    );
});

test('ChatTranscript leaves a turn no rule marked without a session mark', () => {
    const markup = renderTranscript([causedRow()], {
        ...causedOverrides(),
        sessionMarks: new Map(),
        turnDetails: { access: 'summary', serverId: 'srv_1' },
    });

    assert.doesNotMatch(markup, /text-session-mark/);
});

test('ChatTranscript drops the mark where a context card already states it', () => {
    const markup = renderTranscript([causedRow()], {
        ...causedOverrides(),
        causeMarkHidden: true,
    });

    assert.doesNotMatch(markup, /text-trigger-mark/);
});

function causedOverrides(): Partial<TranscriptRenderContextValue> {
    return {
        resolveActorProfile: () => ({
            availability: { kind: 'none' },
            avatarUrl: null,
            deleted: false,
            id: 'blippy',
            isSelf: false,
            kind: 'agent',
            name: 'Blippy',
        }),
    };
}

function causedRow(): TranscriptMessageRow {
    return {
        actor: { id: 'blippy', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id: 'message-caused',
        isFirstInGroup: true,
        kind: 'message',
        message: {
            cause: {
                attribution: 'explicit',
                automationId: 'trg_deploy',
                firedAt: '2026-09-03T11:56:00.000Z',
                fireId: 'trf_12',
                kind: 'trigger',
                live: {
                    fireCount: 12,
                    instruction: null,
                    lastFiredAt: '2026-09-03T11:56:00.000Z',
                    status: 'armed',
                },
                ownerAgentId: 'blippy',
                summary: 'Webhook',
                title: 'Deploy finished',
            },
            content: 'Production is green again after 2m 41s.',
            hausAgentId: 'blippy',
            id: 'message-caused',
            sender: 'Blippy',
            senderType: 'agent',
            sourceSessionId: null,
            sourceSessionKey: 'hosted:blippy',
            timestamp: '2026-09-03T12:00:00.000Z',
        },
    };
}

type ChatRow = TranscriptRow;

/**
 * Renders the transcript the way a host does: project rows into entries and
 * hand the presentation a render context, mirroring the Server
 * `useChatTranscript` wiring in features/servers/chat.
 */
function renderTranscript(rows: ChatRow[], overrides: Partial<TranscriptRenderContextValue> = {}) {
    const context: TranscriptRenderContextValue = {
        canRequestMention: true,
        conversationLayout: { showAgentIdentity: true, showHumanIdentity: true },
        defaultOpenWorkGroups: false,
        flashMessageId: null,
        hiddenCount: 0,
        onOpenThread: () => undefined,
        onToggleReaction: () => undefined,
        onUnfollowThread: () => undefined,
        repliedRunIds: new Set(),
        shouldAnimateItemEnter: () => false,
        threadActionsEnabled: false,
        ...overrides,
    };

    return renderToStaticMarkup(
        <MemoryRouter>
            <DevModeProvider>
                <MessageScrollerProvider>
                    <MessageScroller>
                        <MessageScrollerViewport>
                            <ChatTranscriptPresentation renderContext={context} rows={rows} />
                        </MessageScrollerViewport>
                    </MessageScroller>
                </MessageScrollerProvider>
            </DevModeProvider>
        </MemoryRouter>
    );
}

function widgetRow(id: string): ChatRow {
    return {
        actor: { id: 'tiny', kind: 'agent' },
        completedAt: '2026-03-31T15:00:01.000Z',
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
                data: [
                    { quarter: 'Q1', revenue: 12_000 },
                    { quarter: 'Q2', revenue: 15_500 },
                ],
                series: [{ key: 'revenue', label: 'Revenue' }],
                title: 'Quarterly Revenue',
                unit: 'USD',
                xKey: 'quarter',
            },
            target: 'chat.inline',
            validationError: null,
        },
        responseId: 'rsp_ui',
        sessionKey: 'agent:tiny:session-1',
        startedAt: '2026-03-31T15:00:00.000Z',
    };
}

function countMatches(value: string, pattern: RegExp) {
    return [...value.matchAll(pattern)].length;
}
