import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxEmptySlot, InboxRowList, inboxRowHeight } from './inbox-section-rows.tsx';

/**
 * Only one section is empty on any given Server, so the live page can never
 * show all four slots at once. These are the four facts, rendered.
 */
const labels = [
    'No activity this week.',
    'Nothing needs you.',
    'All caught up.',
    'Nothing running.',
];

test('a settled, empty section draws a slot the size of the row that is missing', () => {
    for (const label of labels) {
        const markup = renderToStaticMarkup(<InboxEmptySlot label={label} />);

        expect(markup).toContain(label);
        expect(markup).toContain(`height:${inboxRowHeight}px`);
        // The outline of a row, not a filled block: a filled block that moves
        // is a skeleton, and a skeleton promises that something is loading.
        expect(markup).toContain('border-dashed');
        expect(markup).toContain('text-muted');
    }
});

test('the slot is a slot and not a row: no card anatomy inside it', () => {
    const markup = renderToStaticMarkup(<InboxEmptySlot label={labels[1]} />);

    expect(markup).not.toContain('item-card__');
    expect(markup).not.toContain('data-slot="item-card"');
    expect(markup).not.toContain('<svg');
});

test('an empty list shows the slot; a filled one shows its rows instead', () => {
    const empty = renderToStaticMarkup(
        <InboxRowList
            emptyLabel="Nothing running."
            listId="test"
            renderRow={(row: { id: string; title: string }) => <span>{row.title}</span>}
            rows={[]}
        />
    );
    const filled = renderToStaticMarkup(
        <InboxRowList
            emptyLabel="Nothing running."
            listId="test"
            renderRow={(row: { id: string; title: string }) => <span>{row.title}</span>}
            rows={[
                { id: 'a', title: 'Blippy is thinking' },
                { id: 'b', title: 'Tiny is reading' },
            ]}
        />
    );

    expect(empty).toContain('Nothing running.');
    expect(empty).toContain('border-dashed');
    // Both share the row frame, so the slot hands its box to the first row.
    expect(empty).toContain('item-card-group--inbox-rows');
    expect(filled).toContain('item-card-group--inbox-rows');
    expect(filled).toContain('Blippy is thinking');
    expect(filled).toContain('Tiny is reading');
    expect(filled).not.toContain('Nothing running.');
    expect(filled).not.toContain('border-dashed');
});
