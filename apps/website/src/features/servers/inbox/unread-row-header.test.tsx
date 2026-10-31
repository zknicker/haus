import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnreadRowHeader } from './unread-row-header.tsx';

function renderHeader() {
    return renderToStaticMarkup(
        <UnreadRowHeader
            actions={<button type="button">ACTION</button>}
            count={<span>COUNT</span>}
            label="all"
            mark={<span>MARK</span>}
            note="NOTE"
            onOpen={() => undefined}
            takesFocus={false}
            time="TIME"
            title="#all"
        />
    );
}

test('the source line is the collapsed line’s own ItemCard, with no press highlight', () => {
    const markup = renderHeader();

    // Same geometry as the collapsed row, so opening it never moves the name.
    expect(markup).toContain('item-card--inbox-line');
    expect(markup).toContain('w-40');
    // The row is already open; the line itself is not a control.
    expect(markup).not.toContain('pressable-feedback');
    expect(markup).not.toContain('aria-expanded');
});

test('the name is the one open control, named for its place', () => {
    const markup = renderHeader();
    const open = markup.slice(markup.indexOf('<button'), markup.indexOf('</button>'));

    expect(open).toContain('aria-label="all"');
    expect(open).toContain('#all');
    expect(open).toContain('focus-visible:ring-2');
});

test('the line ends on its count, with Mark read beside the time', () => {
    const markup = renderHeader();
    const note = markup.indexOf('NOTE');
    const time = markup.indexOf('TIME');
    const action = markup.indexOf('ACTION');
    const count = markup.indexOf('COUNT');

    expect(note).toBeLessThan(time);
    expect(time).toBeLessThan(action);
    expect(action).toBeLessThan(count);
    // The count is the last thing in the line, so nothing can shift it.
    expect(markup.slice(count)).not.toContain('<button');
});
