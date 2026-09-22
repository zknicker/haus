import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';

test('chat messages arrive at full weight with no entrance motion', () => {
    for (const from of ['user', 'assistant'] as const) {
        const markup = renderToStaticMarkup(
            <TranscriptMessageBlock from={from}>Hello</TranscriptMessageBlock>
        );

        expect(markup).not.toContain('opacity:0');
        expect(markup).not.toContain('transform');
        expect(markup).not.toContain('style=');
    }
});

test('chat message prose renders as plain roster text, not a balloon', () => {
    const assistant = renderToStaticMarkup(
        <TranscriptMessageBlock from="assistant">Done</TranscriptMessageBlock>
    );
    const user = renderToStaticMarkup(
        <TranscriptMessageBlock from="user">Done</TranscriptMessageBlock>
    );

    // Every message — the owner's included — renders through the stock
    // ChatMessage content slot as left-aligned roster text; only data-from
    // tells the senders apart. No user balloon chrome anywhere.
    for (const markup of [assistant, user]) {
        expect(markup).toContain('data-slot="chat-message-content"');
        expect(markup).toContain('chat-message__content');
        expect(markup).not.toContain('chat-message__bubble');
    }
    expect(assistant).toContain('data-from="assistant"');
    expect(user).toContain('data-from="user"');
});

test('chat message keeps a shrinkable column so long tokens can wrap', () => {
    const longToken = `{"client_secret":"${'x'.repeat(256)}"}`;

    for (const from of ['user', 'assistant'] as const) {
        const markup = renderToStaticMarkup(
            <TranscriptMessageBlock from={from}>{longToken}</TranscriptMessageBlock>
        );

        expect(markup).toContain('min-w-0');
        expect(markup).toContain('data-slot="chat-message-content"');
    }
});
