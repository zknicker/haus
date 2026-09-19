import { describe, expect, test } from 'bun:test';
import { parseWidgetPayload, widgetFallbackText } from '../contracts.ts';
import {
    splitVisualFences,
    visualBodyLimit,
    visualFallbackText,
    widgetVisualPropsSchema,
} from './contracts.ts';

describe('visual widget contracts', () => {
    test('accepts an html body with an optional title', () => {
        const props = widgetVisualPropsSchema.parse({
            html: '<div><h1>Weekly sales</h1></div>',
            title: 'Weekly sales',
        });

        expect(props.title).toBe('Weekly sales');
    });

    test('rejects an empty or oversized body', () => {
        expect(widgetVisualPropsSchema.safeParse({ html: '' }).success).toBe(false);
        expect(
            widgetVisualPropsSchema.safeParse({ html: 'x'.repeat(visualBodyLimit + 1) }).success
        ).toBe(false);
    });

    test('rejects unknown props', () => {
        expect(
            widgetVisualPropsSchema.safeParse({ html: '<p>hi</p>', sendPrompt: true }).success
        ).toBe(false);
    });

    test('fallback prefers explicit title, then <title>, then first heading', () => {
        expect(visualFallbackText({ html: '<h2>Ranked</h2>', title: 'Chart' })).toBe('Chart');
        expect(visualFallbackText({ html: '<title>Doc title</title><h1>Heading</h1>' })).toBe(
            'Doc title'
        );
        expect(visualFallbackText({ html: '<h3><em>Ranked</em> teams</h3>' })).toBe('Ranked teams');
        expect(visualFallbackText({ html: '<svg viewBox="0 0 10 10"></svg>' })).toBe('Visual');
    });

    test('fallback labels a still-empty streaming body', () => {
        expect(visualFallbackText({ html: '' })).toBe('Visual');
        expect(visualFallbackText({ html: '<div><h2>Ranked te' })).toBe('Visual');
    });

    test('splits prose and closed visual fences in order', () => {
        const segments = splitVisualFences(
            'Here you go:\n```visual Weekly sales\n<h1>Sales</h1>\n<svg></svg>\n```\nDone.'
        );

        expect(segments).toEqual([
            { kind: 'text', text: 'Here you go:\n' },
            {
                html: '<h1>Sales</h1>\n<svg></svg>',
                kind: 'visual',
                open: false,
                title: 'Weekly sales',
            },
            { kind: 'text', text: '\nDone.' },
        ]);
    });

    test('treats a trailing unclosed fence as an open streaming visual', () => {
        const segments = splitVisualFences('Drawing now.\n```visual\n<div><h2>Part');

        expect(segments).toEqual([
            { kind: 'text', text: 'Drawing now.\n' },
            { html: '<div><h2>Part', kind: 'visual', open: true },
        ]);
    });

    test('a bare fence opener with no body yet is an open visual', () => {
        const segments = splitVisualFences('```visual');

        expect(segments).toEqual([{ html: '', kind: 'visual', open: true }]);
    });

    test('ignores fence-like text that does not start a line', () => {
        const content = 'Use a `visual` fence like ```visual inline mentions.';

        expect(splitVisualFences(content)).toEqual([{ kind: 'text', text: content }]);
    });

    /**
     * The bytes a real eval run produced: Grok glued the opener to the end of
     * its last sentence. The fence is still a fence — the alternative is the
     * whole chart dumped into the transcript as raw markup.
     */
    test('recovers a fence the model glued to the end of a sentence', () => {
        const segments = splitVisualFences(
            'Monday closed at **$750**, a soft day against a **$964** daily run rate.```visual Sales through Sep 14\n<h2>Sales</h2>\n<div>bars</div>\n```\n\nMCP is up. Check back after the morning sync.'
        );

        expect(segments).toEqual([
            {
                kind: 'text',
                text: 'Monday closed at **$750**, a soft day against a **$964** daily run rate.',
            },
            {
                html: '<h2>Sales</h2>\n<div>bars</div>',
                kind: 'visual',
                open: false,
                title: 'Sales through Sep 14',
            },
            { kind: 'text', text: '\n\nMCP is up. Check back after the morning sync.' },
        ]);
    });

    test('a glued opener streams as an open visual, the way a line-start one does', () => {
        expect(splitVisualFences('Sales today.```visual Today')).toEqual([
            { kind: 'text', text: 'Sales today.' },
            { html: '', kind: 'visual', open: true, title: 'Today' },
        ]);
        expect(splitVisualFences('Sales today.```visual Today\n<div>par')).toEqual([
            { kind: 'text', text: 'Sales today.' },
            { html: '<div>par', kind: 'visual', open: true, title: 'Today' },
        ]);
    });

    test('closes a fence whose terminator is glued to the last body line', () => {
        expect(
            splitVisualFences('```visual Sales\n<div>x</div>\n<script>draw()</script>```\nDone.')
        ).toEqual([
            {
                html: '<div>x</div>\n<script>draw()</script>',
                kind: 'visual',
                open: false,
                title: 'Sales',
            },
            { kind: 'text', text: '\nDone.' },
        ]);
    });

    test('a terminator with trailing text closes the fence and the rest is prose', () => {
        expect(splitVisualFences('```visual\n<p>1</p>\n``` and that is the week.')).toEqual([
            { html: '<p>1</p>', kind: 'visual', open: false },
            { kind: 'text', text: ' and that is the week.' },
        ]);
    });

    /**
     * A terminator ends a line or has whitespace after it. Without that word
     * boundary a visual that draws the fence syntax it teaches would cut its own
     * body in half at the first backtick run inside its markup.
     */
    test('a backtick run inside markup does not terminate the body', () => {
        expect(
            splitVisualFences(
                '```visual Fence syntax\n<code>```visual Weekly sales</code>\n<p>Then this.</p>\n```\nDone.'
            )
        ).toEqual([
            {
                html: '<code>```visual Weekly sales</code>\n<p>Then this.</p>',
                kind: 'visual',
                open: false,
                title: 'Fence syntax',
            },
            { kind: 'text', text: '\nDone.' },
        ]);
    });

    test('ignores an opener inside a fenced block that documents the syntax', () => {
        const fourBacktick =
            'The contract:\n\n````\n```visual Weekly sales\n<h1>Sales</h1>\n```\n````\n\nThat is it.';
        const language =
            'Like so:\n```md\n```visual Weekly sales\n<h1>Sales</h1>\n```\n```\nClear?';

        expect(splitVisualFences(fourBacktick)).toEqual([{ kind: 'text', text: fourBacktick }]);
        expect(splitVisualFences(language)).toEqual([{ kind: 'text', text: language }]);
    });

    test('ignores a fence tag inside inline code or a longer backtick run', () => {
        for (const content of [
            'The tag is `` ```visual `` and the body is raw HTML.',
            'Write ````visual for a four-backtick block.',
            'Ask me to.```visualize it and nothing renders.\n<p>x</p>',
        ]) {
            expect(splitVisualFences(content), content).toEqual([{ kind: 'text', text: content }]);
        }
    });

    test('keeps plain content as one text segment', () => {
        expect(splitVisualFences('No fences here.')).toEqual([
            { kind: 'text', text: 'No fences here.' },
        ]);
    });

    test('parses the fence payload into the visual render envelope', () => {
        const parsed = parseWidgetPayload('visual', {
            html: '<h1>Q3 revenue</h1><p>bars</p>',
        });

        expect(parsed.render.component).toBe('haus.widget.visual');
        expect(parsed.fallbackText).toBe('Q3 revenue');
        expect(widgetFallbackText('visual', { html: '<h1>Q3 revenue</h1>' })).toBe('Q3 revenue');
    });
});
