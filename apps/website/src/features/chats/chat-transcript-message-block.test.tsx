import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';

test('message text leads one compactly spaced attachment group', () => {
    const markup = renderToStaticMarkup(
        <TranscriptMessageBlock
            attachments={<div data-slot="attachment">Preview</div>}
            from="assistant"
        >
            Caption
        </TranscriptMessageBlock>
    );

    expect(markup.match(/data-slot="attachment-group"/gu)).toHaveLength(1);
    expect(markup).toContain('flex min-w-0 flex-col gap-1');
    expect(markup).not.toContain('flex min-w-0 flex-col gap-2');
    expect(markup.indexOf('Caption')).toBeLessThan(markup.indexOf('data-slot="attachment-group"'));
});
