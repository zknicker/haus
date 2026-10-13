import { expect, test } from 'bun:test';
import { artifactTextRenderer } from './artifact-text.ts';

const file = (filename: string, content_type = 'application/octet-stream') => ({
    content_type,
    filename,
});

test('Markdown renders, HTML runs sandboxed, and source and data files show as code', () => {
    expect(artifactTextRenderer(file('readme.md', 'text/markdown'))).toBe('markdown');
    expect(artifactTextRenderer(file('notes.mdx'))).toBe('markdown');
    expect(artifactTextRenderer(file('page.html', 'text/html'))).toBe('html');
    expect(artifactTextRenderer(file('page.htm'))).toBe('html');
    expect(artifactTextRenderer(file('notes.txt', 'text/plain'))).toBe('code');
    expect(artifactTextRenderer(file('app.ts', 'text/plain'))).toBe('code');
    expect(artifactTextRenderer(file('data.json', 'application/json'))).toBe('code');
    expect(artifactTextRenderer(file('rows.csv', 'text/csv'))).toBe('code');
    expect(artifactTextRenderer(file('rows.tsv'))).toBe('code');
    expect(artifactTextRenderer(file('server.log'))).toBe('code');
});

test('binary documents, media, and archives are never fetched as text', () => {
    expect(artifactTextRenderer(file('brief.docx'))).toBeNull();
    expect(artifactTextRenderer(file('model.xlsx'))).toBeNull();
    expect(artifactTextRenderer(file('memo.rtf', 'text/rtf'))).toBeNull();
    expect(artifactTextRenderer(file('deck.pdf', 'application/pdf'))).toBeNull();
    expect(artifactTextRenderer(file('photo.png', 'image/png'))).toBeNull();
    expect(artifactTextRenderer(file('logo.svg', 'image/svg+xml'))).toBeNull();
    expect(artifactTextRenderer(file('source.zip', 'application/zip'))).toBeNull();
    expect(artifactTextRenderer(file('blob'))).toBeNull();
});
