import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderSnippet } from './chat-search-snippet.tsx';

test('a snippet reads a Markdown link as its label, not its target', () => {
    const markup = snippet(
        'A Worker opened a pull request. [Avatar upload: crop, resize, and save](worker://caw_Kst)',
        'upload'
    );
    expect(markup).toContain('Avatar <mark class="search-results__hit">upload</mark>: crop');
    expect(markup).not.toContain('worker://');
    expect(markup).not.toContain('](');
});

test('a snippet drops emphasis markers and marks every hit', () => {
    expect(snippet('**Ship** the upload, then upload again', 'upload')).toBe(
        'Ship the <mark class="search-results__hit">upload</mark>, then <mark class="search-results__hit">upload</mark> again'
    );
});

test('a long message opens near its first hit', () => {
    const markup = snippet(`${'filler '.repeat(40)}the upload path`, 'upload');
    expect(markup.startsWith('…')).toBe(true);
    expect(markup).toContain('<mark class="search-results__hit">upload</mark> path');
});

function snippet(content: string, query: string) {
    return renderToStaticMarkup(<>{renderSnippet(content, query)}</>);
}
