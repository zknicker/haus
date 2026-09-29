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
import { setShowTasksInChat } from '../tasks/show-tasks-in-chat.ts';
import { ChatTranscriptPresentation } from './chat-transcript.tsx';
import type { TranscriptRow } from './chat-transcript-model.ts';
import type { TranscriptRenderContextValue } from './chat-transcript-render-context.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

test('a claimed task states nothing in Chat while the setting is off', () => {
    const markup = withTasksInChat(false, () =>
        renderTranscript([
            taskRow('msg_1', 'Rename the deploy script', {
                origin: 'claimed',
                status: 'in_progress',
            }),
        ])
    );

    assert.doesNotMatch(markup, /message-task-chip/);
    assert.doesNotMatch(markup, /Task #1/);
    // No card either: an empty frame announcing nothing is the one thing the
    // surface must never be.
    assert.doesNotMatch(markup, /Open thread/);
});

test('a claimed task with replies hides its task label when the setting is off', () => {
    const row = taskRow('msg_1', 'Rename the deploy script', {
        origin: 'claimed',
        status: 'in_progress',
    });
    const markup = withTasksInChat(false, () =>
        renderTranscript([{ ...row, thread: threadSummary('msg_1', 2) }])
    );

    assert.match(markup, /2 replies/);
    assert.match(markup, /aria-label="Open thread, 2 replies"/);
    assert.doesNotMatch(markup, /message-task-chip/);
    assert.doesNotMatch(markup, /Task #1/);
    assert.doesNotMatch(markup, /0 replies/);
});

test('a claimed task with replies shows its task label when the setting is on', () => {
    const row = taskRow('msg_1', 'Rename the deploy script', { origin: 'claimed' });
    const markup = withTasksInChat(true, () =>
        renderTranscript([{ ...row, thread: threadSummary(row.id, 2) }])
    );

    assert.match(markup, /aria-label="Open thread, Task #1, 2 replies"/);
    assert.match(markup, /message-task-chip/);
    assert.match(markup, /Task #1/);
});

test('turning the setting on gives a claimed task the ordinary task surface', () => {
    const markup = withTasksInChat(true, () =>
        renderTranscript([
            taskRow('msg_1', 'Rename the deploy script', {
                origin: 'claimed',
                status: 'in_progress',
            }),
        ])
    );

    assert.match(markup, /message-task-chip/);
    assert.match(markup, /Task #1/);
    assert.doesNotMatch(markup, /0 replies/);
});

test('a task a human made shows in Chat whatever the setting says', () => {
    const composed = withTasksInChat(false, () =>
        renderTranscript([taskRow('msg_1', 'Ship the board', { origin: 'composed' })])
    );
    const converted = withTasksInChat(false, () =>
        renderTranscript([taskRow('msg_2', 'Write the docs', { number: 2, origin: 'converted' })])
    );

    assert.match(composed, /message-task-chip/);
    assert.match(composed, /Task #1/);
    assert.match(converted, /message-task-chip/);
    assert.match(converted, /Task #2/);
});

/** The preference is a device-wide store, so a test that flips it puts it back. */
function withTasksInChat<TResult>(enabled: boolean, render: () => TResult): TResult {
    setShowTasksInChat(enabled);

    try {
        return render();
    } finally {
        setShowTasksInChat(false);
    }
}

function taskRow(
    id: string,
    content: string,
    overrides: Partial<NonNullable<TranscriptMessageRow['message']['task']>> = {}
): TranscriptMessageRow {
    return {
        actor: null,
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            content,
            id,
            sender: 'You',
            senderType: 'user',
            sourceSessionId: null,
            sourceSessionKey: 'session-1',
            task: {
                assignee: { handle: 'blippy', id: 'agt_blippy', kind: 'agent' },
                claimed_at: '2026-09-08T12:00:00.000Z',
                created_at: '2026-09-08T12:00:00.000Z',
                labels: [],
                live: false,
                number: 1,
                origin: 'composed',
                priority: 'none',
                status: 'todo',
                tier: 'tracked',
                updated_at: '2026-09-08T12:00:20.000Z',
                ...overrides,
            },
            timestamp: '2026-09-08T12:00:00.000Z',
        },
    };
}

function threadSummary(anchorMessageId: string, replyCount: number) {
    return {
        anchorMessageId,
        followed: false,
        latestReplyAt: '2026-09-08T12:00:30.000Z',
        replyCount,
        threadChatId: 'cht_thread',
        unreadCount: 0,
    };
}

/** The transcript as a host renders it, with only the task surface wired. */
function renderTranscript(
    rows: TranscriptRow[],
    overrides: Partial<TranscriptRenderContextValue> = {}
) {
    const context: TranscriptRenderContextValue = {
        canRequestMention: true,
        conversationLayout: { showAgentIdentity: true, showHumanIdentity: true },
        defaultOpenWorkGroups: false,
        flashMessageId: null,
        hiddenCount: 0,
        onOpenThread: () => undefined,
        onUnfollowThread: () => undefined,
        repliedRunIds: new Set(),
        threadActionsEnabled: true,
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
