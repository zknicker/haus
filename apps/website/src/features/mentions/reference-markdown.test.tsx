import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceMarkdown } from './reference-markdown.tsx';

// An inline-flex link sits on the text baseline by default, and the chip's
// leading favicon has no baseline of its own, so the label rode above the line.
test('centers website links on the surrounding line like other references', () => {
    const markup = renderToStaticMarkup(
        <ReferenceMarkdown content="The [official docs](https://platform.openai.com/docs) confirm it." />
    );

    expect(markup).toMatch(/<a aria-label="Open [^"]+" class="[^"]*\balign-middle\b/);
    expect(markup).toContain('reference-chip');
});
