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

// CommonMark reads a bare "42." as an empty ordered list item, which hung the
// number outside the reply column over the author's avatar.
test('renders a bare number reply as text, not an empty list item', () => {
    const markup = renderToStaticMarkup(<ReferenceMarkdown content="42." />);

    expect(markup).not.toContain('<ol');
    expect(markup).toContain('<p>42.</p>');
});

// A fence rendered as the stock snippet scrolled a long line past the message
// column; it is the trace's compact block now, which wraps.
test('renders a fenced block on the shared compact code block', () => {
    const markup = renderToStaticMarkup(
        <ReferenceMarkdown content={'Run:\n\n```ts\nconst a = 1;\nconst b = 2;\n```'} />
    );

    expect(markup).toContain('code-block--compact');
    expect(markup).toContain('code-block--numbered');
    expect(markup).toMatch(/>TypeScript</);
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).not.toContain('<pre><div');
});

test('keeps inline code inline', () => {
    const markup = renderToStaticMarkup(<ReferenceMarkdown content="Use `bun test` here." />);

    expect(markup).not.toContain('code-block');
    expect(markup).toContain('bun test');
});

// A link whose scheme Haus does not know reads as its label text: no chip,
// no anchor to the target, and nothing to press.
test('renders a link with an unknown scheme as its label text', () => {
    const markup = renderToStaticMarkup(
        <ReferenceMarkdown content={'See [Fix the draft](retired://caw_one) now.'} />
    );

    expect(markup).toContain('See Fix the draft now.');
    expect(markup).not.toContain('retired://');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<a ');
});
