import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TraceValue, TurnTraceCode } from './turn-trace-code.tsx';
import { TraceJson } from './turn-trace-json.tsx';

const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

test('a long block shows its first eight lines and a control at its bottom for the rest', () => {
    const markup = renderToStaticMarkup(<TurnTraceCode code={lines(40)} label="Output" />);

    assert.match(markup, /line 8/);
    assert.doesNotMatch(markup, /line 9\b/);
    assert.match(markup, /aria-expanded="false"[^>]*>Show 32 more lines</);
    // Copy always takes the whole block.
    assert.match(markup, /code-block--numbered/);
    assert.doesNotMatch(markup, /aria-expanded="false"[^>]*>Show less</);
});

test('a short block shows whole, and a one-line command sits at a prompt without numbers', () => {
    const markup = renderToStaticMarkup(
        <TurnTraceCode code="bun test" label="Command" language="shellscript" />
    );

    assert.match(markup, /code-block--prompt/);
    assert.doesNotMatch(markup, /code-block--numbered|Show \d+ more/);
    assert.match(markup, /aria-label="Copy command"/);
});

test('a value draws as a JSON tree when it is JSON, and as text otherwise', () => {
    assert.match(
        renderToStaticMarkup(<TraceValue label="Output" value='{"ok":true}' />),
        /role="treegrid"/
    );
    const text = renderToStaticMarkup(<TraceValue label="Output" value="done" />);
    assert.doesNotMatch(text, /role="treegrid"/);
    assert.match(text, />done</);
    assert.equal(renderToStaticMarkup(<TraceValue label="Output" value="" />), '');
});

test('a JSON tree is a keyboard tree: rows state their level and whether they are open', () => {
    const markup = renderToStaticMarkup(
        <TraceJson
            label="Result"
            value={{
                issues: [{ id: 'PRD-1', title: 't' }],
                note: 'n'.repeat(200),
                total: 1,
            }}
        />
    );

    assert.match(
        markup,
        /role="treegrid"[^>]*aria-label="Result"|aria-label="Result"[^>]*role="treegrid"/
    );
    assert.match(
        markup,
        /aria-level="1"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*aria-level="1"/
    );
    // The first level opens; the level under it stays closed and states its size.
    assert.match(markup, />\{2 keys\}</);
    assert.doesNotMatch(markup, />PRD-1</);
    assert.match(markup, / \+80 chars</);
    assert.match(markup, /aria-label="Copy result"/);
});

test('line numbers are one theme rule shared by the file view and trace evidence', () => {
    const theme = readFileSync(new URL('../../styles/default-theme.css', import.meta.url), 'utf8');

    assert.match(
        theme,
        /\.code-block--numbered \.line::before \{[^}]*content: counter\(code-line\)/
    );
    assert.equal(theme.match(/content: counter\(code-line\)/g)?.length, 1);
    assert.doesNotMatch(theme, /\.code-pane \.line/);
});
