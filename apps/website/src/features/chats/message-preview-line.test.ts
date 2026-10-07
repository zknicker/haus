import { expect, test } from 'bun:test';
import { messagePreviewLine } from './message-preview-line.ts';

test('a preview line shows reference labels instead of their targets', () => {
    expect(
        messagePreviewLine(
            'Ask [@Blippy](agent://agt_blippy) and [@Ada](user://usr_ada) about the [#product](chat://cht_sO6tOmR7_sqTzXwE) review'
        )
    ).toBe('Ask @Blippy and @Ada about the #product review');
});

test('a preview line collapses a web link to its text', () => {
    expect(messagePreviewLine('See\n[the release notes](https://haus.dev/releases)  now')).toBe(
        'See the release notes now'
    );
});

test('a preview line drops the heading markers a Markdown report opens with', () => {
    expect(messagePreviewLine('## Summary\nFixed the stale wording in the README.')).toBe(
        'Summary Fixed the stale wording in the README.'
    );
    expect(messagePreviewLine('# Top\n### Deeper')).toBe('Top Deeper');
});

test('a preview line keeps a #channel reference, which is not a heading', () => {
    expect(messagePreviewLine('#product ships today')).toBe('#product ships today');
});

test('a preview line reads a bullet list as a sentence', () => {
    expect(messagePreviewLine('Did this:\n- Read the file\n* Fixed it\n  + Shipped it')).toBe(
        'Did this: Read the file Fixed it Shipped it'
    );
    // Only a bullet takes the space Markdown asks of it; a dash does not.
    expect(messagePreviewLine('Ran -5m behind')).toBe('Ran -5m behind');
});

test('a preview line drops emphasis and code markers', () => {
    expect(messagePreviewLine('**Fixed** the `README` and __shipped__ it')).toBe(
        'Fixed the README and shipped it'
    );
    expect(messagePreviewLine('Ran:\n```bash\nbun test\n```')).toBe('Ran: bash bun test');
});

test('a preview line reads a visual-only message as its fence title', () => {
    expect(
        messagePreviewLine('```visual Weekly sales\n<h1>Weekly sales</h1>\n<svg></svg>\n```')
    ).toBe('Weekly sales');
});

test('a preview line falls back to an untitled visual heading', () => {
    expect(messagePreviewLine('```visual\n<div><h2>Ranked teams</h2></div>\n```')).toBe(
        'Ranked teams'
    );
});

test('a preview line keeps the prose around a visual', () => {
    expect(
        messagePreviewLine(
            'Here is the chart.\n```visual Weekly sales\n<svg></svg>\n```\nLet me know.'
        )
    ).toBe('Here is the chart. Weekly sales Let me know.');
});

test('a preview line reads a still-streaming visual as its label', () => {
    expect(messagePreviewLine('Drawing now.\n```visual Weekly sales\n<h1>Weekly')).toBe(
        'Drawing now. Weekly sales'
    );
    expect(messagePreviewLine('Drawing now.\n```visual\n<div><svg')).toBe('Drawing now. Visual');
});

test('a preview line leaves a message without a visual fence alone', () => {
    expect(messagePreviewLine('Shipped the visual renderer today')).toBe(
        'Shipped the visual renderer today'
    );
});

test('a preview line reads Markdown escapes as the characters they protect', () => {
    expect(messagePreviewLine('Run sleep 20 \\&\\& echo hi')).toBe('Run sleep 20 && echo hi');
    expect(messagePreviewLine('2 \\* 3 \\_not emphasis\\_ \\# not a heading')).toBe(
        '2 * 3 _not emphasis_ # not a heading'
    );
    // An escaped marker is literal text, not formatting to drop.
    expect(messagePreviewLine('\\*\\*kept\\*\\* and \\`ticks\\`')).toBe('**kept** and `ticks`');
    expect(messagePreviewLine('\\[not a link\\](https://haus.dev)')).toBe(
        '[not a link](https://haus.dev)'
    );
    // A backslash before a letter is not an escape.
    expect(messagePreviewLine('C:\\temp')).toBe('C:\\temp');
});

test('a preview line flattens bold, code, and links around escapes into one line', () => {
    expect(
        messagePreviewLine('**Deploy** `bun run build \\&\\& ship`\nsee [the docs](https://haus.dev)')
    ).toBe('Deploy bun run build && ship see the docs');
});
