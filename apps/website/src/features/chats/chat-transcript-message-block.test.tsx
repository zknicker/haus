import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';

test('message text leads its attachments in one media slot', () => {
    const markup = renderToStaticMarkup(
        <TranscriptMessageBlock
            attachments={<div data-slot="attachment">Preview</div>}
            from="assistant"
        >
            Caption
        </TranscriptMessageBlock>
    );

    expect(markup.match(/chat-message__media/gu)).toHaveLength(1);
    // Media is a block: one block step between text and strip, and after it.
    expect(markup).toContain('flex min-w-0 flex-col gap-(--chat-block-gap) pb-(--chat-block-gap)');
    expect(markup).not.toContain('flex min-w-0 flex-col gap-2');
    expect(markup.indexOf('Caption')).toBeLessThan(markup.indexOf('data-slot="attachment"'));
});
