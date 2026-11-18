import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';
import { FileTextPreview } from './file-text-preview.tsx';

// The App's chrome is unselectable by default (global.css); these are the
// content regions that opt back in so their text copies like a document.
const optIn = 'data-selectable-text=""';
const quoteSource = { href: 'haus://workspace/notes.md', label: 'notes.md' };

test('a message body opts its text into selection, its attachments do not', () => {
    const markup = renderToStaticMarkup(
        <TranscriptMessageBlock attachments={<div data-slot="attachment">a.png</div>} from="user">
            Hello there
        </TranscriptMessageBlock>
    );

    expect(markup).toMatch(/<div[^>]*data-selectable-text=""[^>]*>Hello there<\/div>/u);
    expect(markup).not.toMatch(/chat-message__media[^>]*data-selectable-text/u);
});

test('rendered Markdown, with its code blocks, is selectable content', () => {
    const markup = renderToStaticMarkup(
        <ReferenceMarkdown content={'Run:\n\n```ts\nconst a = 1;\nconst b = 2;\n```'} />
    );

    expect(markup.indexOf(optIn)).toBeLessThan(markup.indexOf('Run:'));
    expect(markup).toContain('<pre');
});

test('a markdown file preview and a source file preview are selectable', () => {
    const markdown = renderToStaticMarkup(
        <FileTextPreview
            content="# Notes"
            path="notes.md"
            quoteSource={quoteSource}
            renderer="markdown"
        />
    );
    const source = renderToStaticMarkup(
        <FileTextPreview
            content="const a = 1;"
            path="notes.ts"
            quoteSource={quoteSource}
            renderer="code"
        />
    );

    expect(markdown).toContain(optIn);
    // Source draws in a <pre>, which global.css opts in directly.
    expect(source).toContain('<pre><code>const a = 1;</code></pre>');
});

test('a reported fact value can be copied', () => {
    const markup = renderToStaticMarkup(<SettingsFact>/Users/me/notes.md</SettingsFact>);

    expect(markup).toContain(optIn);
});
