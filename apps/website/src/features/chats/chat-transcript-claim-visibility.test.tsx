import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryRouter } from 'react-router-dom';
import {
    MessageScroller,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../../components/chats/message-scroller.tsx';
import { DevModeProvider } from '../../components/dev-mode-provider.tsx';
import { renderWithTrpc } from '../../test-support/trpc-test-provider.tsx';
import { setShowClaimsInChat } from '../claims/show-claims-in-chat.ts';
import type { TranscriptRow } from './chat-transcript-model.ts';
import type { TranscriptRenderContextValue } from './chat-transcript-render-context.tsx';
import { ChatTranscriptPresentation } from './chat-transcript.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

test('an Agent claim states nothing in Chat while the setting is off', () => {
    const markup = withClaimsInChat(false, () =>
        renderTranscript([
            claimRow('msg_1', 'Rename the deploy script', {
                origin: 'claimed',
                status: 'in_progress',
            }),
        ])
    );

    assert.doesNotMatch(markup, /message-claim-chip/);
    assert.doesNotMatch(markup, /Claim #1/);
});

test('turning the setting on gives an Agent claim the ordinary claim surface', () => {
    const markup = withClaimsInChat(true, () =>
        renderTranscript([
            claimRow('msg_1', 'Rename the deploy script', {
                origin: 'claimed',
                status: 'in_progress',
            }),
        ])
    );

    assert.match(markup, /message-claim-chip/);
    assert.match(markup, /Claim #1/);
    assert.doesNotMatch(markup, /0 replies/);
});

test('a claim a human made shows in Chat whatever the setting says', () => {
    const composed = withClaimsInChat(false, () =>
        renderTranscript([claimRow('msg_1', 'Ship the board', { origin: 'composed' })])
    );
    const converted = withClaimsInChat(false, () =>
        renderTranscript([claimRow('msg_2', 'Write the docs', { number: 2, origin: 'converted' })])
    );

    assert.match(composed, /message-claim-chip/);
    assert.match(composed, /Claim #1/);
    assert.match(converted, /message-claim-chip/);
    assert.match(converted, /Claim #2/);
});

/** The preference is a device-wide store, so a test that flips it puts it back. */
function withClaimsInChat<TResult>(enabled: boolean, render: () => TResult): TResult {
    setShowClaimsInChat(enabled);

    try {
        return render();
    } finally {
        setShowClaimsInChat(false);
    }
}

function claimRow(
    id: string,
    content: string,
    overrides: Partial<NonNullable<TranscriptMessageRow['message']['claim']>> = {}
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
            claim: {
                assignee: { handle: 'blippy', id: 'agt_blippy', kind: 'agent' },
                claimed_at: '2026-09-08T12:00:00.000Z',
                created_at: '2026-09-08T12:00:00.000Z',
                live: false,
                number: 1,
                origin: 'composed',
                status: 'todo',
                tier: 'tracked',
                updated_at: '2026-09-08T12:00:20.000Z',
                ...overrides,
            },
            timestamp: '2026-09-08T12:00:00.000Z',
        },
    };
}

/** The transcript as a host renders it, with only the claim surface wired. */
function renderTranscript(rows: TranscriptRow[]) {
    const context: TranscriptRenderContextValue = {
        canRequestMention: true,
        conversationLayout: { showAgentIdentity: true, showHumanIdentity: true },
        defaultOpenWorkGroups: false,
        flashMessageId: null,
        hiddenCount: 0,
        repliedRunIds: new Set(),
    };

    return renderWithTrpc(
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
