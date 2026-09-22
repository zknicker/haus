import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
    MessageScroller,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../../../components/chats/message-scroller.tsx';
import { DevModeProvider } from '../../../components/dev-mode-provider.tsx';
import { ChatTranscriptPresentation } from '../../chats/chat-transcript.tsx';
import { getTranscriptItemKey } from '../../chats/chat-transcript-item-utils.ts';
import { buildTranscriptEntries, type TranscriptRow } from '../../chats/chat-transcript-model.ts';
import type { TranscriptRenderContextValue } from '../../chats/chat-transcript-render-context.tsx';
import { chatMessageDirectories, projectChatMessage } from './chat-message-model.ts';
import { projectPendingChatMessageRows } from './pending-messages.tsx';
import type { PendingChatMessage } from './use-pending-messages.ts';

const nonce = 'nonce_send_1';
const createdAt = '2026-08-14T14:41:00.000Z';

const pending: PendingChatMessage = {
    attachments: [],
    content: 'Sending this right now.',
    createdAt,
    messageId: 'msg_1',
    nonce,
    submittedAt: '2026-08-14T14:40:59.412Z',
};

test('a send and the durable message it becomes share one transcript key', () => {
    expect(itemKey(pendingRow())).toBe(itemKey(durableRow()));
    expect(itemKey(pendingRow())).toBe(`send:${nonce}`);
});

test('confirming a send keeps the turn identity and grouping it already had', () => {
    const optimistic = buildTranscriptEntries({ rows: [pendingRow()] });
    const confirmed = buildTranscriptEntries({ rows: [durableRow()] });

    expect(optimistic).toHaveLength(1);
    expect(confirmed).toHaveLength(1);
    expect(optimistic[0]?.id).toBe(confirmed[0]?.id ?? '');
    expect(optimistic[0]?.kind === 'turn' ? optimistic[0].key : null).toBe(
        confirmed[0]?.kind === 'turn' ? confirmed[0].key : ''
    );
    // The receipt's own creation time rides the pending row, so the turn
    // header never restates the time when the durable message replaces it.
    expect(optimistic[0]?.timestamp).toBe(confirmed[0]?.timestamp ?? '');
});

test('a pending send renders exactly as its confirmed message does', () => {
    const optimistic = renderTranscript([pendingRow()]);
    const confirmed = renderTranscript([durableRow()]);

    expect(messageBody(optimistic)).toBe(messageBody(confirmed));
    expect(turnClassName(optimistic)).toBe(turnClassName(confirmed));
    expect(optimistic).not.toContain('opacity-');
});

function itemKey(row: TranscriptRow) {
    return getTranscriptItemKey({ kind: 'row', row });
}

function pendingRow() {
    const [row] = projectPendingChatMessageRows([pending], 'usr_zach');

    if (!row) {
        throw new Error('the pending send projected no row');
    }

    return row;
}

function durableRow() {
    return projectChatMessage(durableMessage, null, chatMessageDirectories([]));
}

const durableMessage: ChatMessage = {
    attachments: [],
    author: { kind: 'human', profile: undefined, userId: 'usr_zach' },
    body: { kind: 'text' },
    chatId: 'cht_1',
    content: pending.content,
    createdAt,
    id: 'msg_1',
    nonce,
    reactions: [],
    reply: null,
    runId: null,
    sequence: 1,
    serverId: 'srv_1',
    sessionGeneration: null,
    task: null,
};

/**
 * Everything the reader sees at rest: the turn header, the prose, the marks.
 * It stops at the hover action island, which is absolutely positioned and
 * transparent until the pointer arrives, so it occupies no space either way.
 * The two rows differ only where they must — the durable id the pending row
 * cannot know yet, and the test hook that names an unconfirmed row.
 */
function messageBody(markup: string) {
    const start = markup.indexOf('data-slot="chat-message-body"');
    const end = Math.min(
        ...['<div class="chat-message__actions', '<div aria-hidden="true" data-message-scroller']
            .map((marker) => markup.indexOf(marker, start))
            .filter((index) => index > -1)
    );

    expect(start).toBeGreaterThan(-1);

    return (
        markup
            .slice(start, Number.isFinite(end) ? end : undefined)
            // Only one of the two slices runs to the document's end, so the
            // closing tags it collects are the cut, not a rendering difference.
            .replace(/(?:<\/div>)+$/u, '')
            .replaceAll(`pending:${nonce}`, 'msg_1')
            .replaceAll(' data-slot="pending-chat-message"', '')
    );
}

function turnClassName(markup: string) {
    return /<div class="(relative -mx-5[^"]*)"/u.exec(markup)?.[1] ?? '';
}

function renderTranscript(rows: TranscriptRow[]) {
    const context: TranscriptRenderContextValue = {
        canRequestMention: true,
        conversationLayout: { showAgentIdentity: true, showHumanIdentity: true },
        defaultOpenWorkGroups: false,
        flashMessageId: null,
        hiddenCount: 0,
        onOpenThread: () => undefined,
        onUnfollowThread: () => undefined,
        repliedRunIds: new Set(),
        // The host always resolves the viewer's own profile, for the pending
        // row and the durable one alike, from the same actor identity.
        resolveActorProfile: () => ({
            availability: { kind: 'none' },
            avatarUrl: null,
            deleted: false,
            id: 'usr_zach',
            isSelf: true,
            kind: 'participant',
            name: 'Zach',
        }),
        threadActionsEnabled: false,
        viewerUserId: 'usr_zach',
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
