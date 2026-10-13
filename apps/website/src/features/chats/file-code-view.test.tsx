import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileCodeView } from './file-code-view.tsx';

const path = 'notes/app.ts';
const quoteSource = { href: 'haus://workspace/notes/app.ts', label: path };

test('the number column is sized to the line count', () => {
    const lines = Array.from({ length: 120 }, (_, index) => `line ${index}`).join('\n');
    expect(render(lines)).toContain('--code-line-digits:3');
});

test('the code paints as plain text before highlighting resolves', () => {
    const markup = render('const a = 1;');
    expect(markup).toContain('<pre><code>const a = 1;</code></pre>');
});

function render(content: string) {
    return renderToStaticMarkup(
        <FileCodeView content={content} path={path} quoteSource={quoteSource} />
    );
}
