import { expect, test } from 'bun:test';
import type { TranscriptMessage } from './chat-transcript-message.tsx';
import {
    getMessageCopyText,
    type TranscriptRenderContextValue,
} from './chat-transcript-render-context.tsx';

function message(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
    return {
        content: 'Hello world',
        id: 'message-1',
        sender: 'Agent',
        senderType: 'agent',
        sourceSessionKey: 'session-1',
        timestamp: '2026-06-17T15:00:00.000Z',
        ...overrides,
    };
}

function baseContext(
    overrides: Partial<TranscriptRenderContextValue> = {}
): TranscriptRenderContextValue {
    return {
        canRequestMention: false,
        conversationLayout: { showAgentIdentity: true, showHumanIdentity: true },
        defaultOpenWorkGroups: false,
        flashMessageId: null,
        hiddenCount: 0,
        onOpenThread: () => undefined,
        onUnfollowThread: () => undefined,
        repliedRunIds: new Set(),
        threadActionsEnabled: false,
        ...overrides,
    };
}

test('falls back to message.content with no context', () => {
    expect(getMessageCopyText(null, message())).toBe('Hello world');
    expect(getMessageCopyText(undefined, message())).toBe('Hello world');
});

test('falls back to message.content when the context has no override', () => {
    expect(getMessageCopyText(baseContext(), message())).toBe('Hello world');
});

test('uses the context override when one is supplied', () => {
    const context = baseContext({ messageCopyText: () => 'Draft hint instead.' });

    expect(getMessageCopyText(context, message({ content: '' }))).toBe('Draft hint instead.');
});
