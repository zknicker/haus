import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    StripEmptySlot,
    StripRowList,
    stripLayoutKey,
    stripRowHeight,
} from './strip-section-rows.tsx';

/**
 * Only one section is empty on any given Server, so the live page can never
 * show all three slots at once. These are the three facts, rendered.
 */
const labels = ['No activity this week.', 'All caught up.', 'Nothing running.'];

test('a settled, empty section draws a slot the size of the row that is missing', () => {
    for (const label of labels) {
        const markup = renderToStaticMarkup(<StripEmptySlot label={label} layoutKey="empty" />);

        expect(markup).toContain(label);
        expect(markup).toContain(`height:${stripRowHeight}px`);
        // The outline of a row, not a filled block: a filled block that moves
        // is a skeleton, and a skeleton promises that something is loading.
        expect(markup).toContain('border-dashed');
        expect(markup).toContain('text-muted');
    }
});

test('the slot is a slot and not a row: no card anatomy inside it', () => {
    const markup = renderToStaticMarkup(<StripEmptySlot label={labels[1]} layoutKey="empty" />);

    expect(markup).not.toContain('item-card__');
    expect(markup).not.toContain('data-slot="item-card"');
    expect(markup).not.toContain('<svg');
});

test('an empty list shows the slot; a filled one shows its rows instead', () => {
    const empty = renderToStaticMarkup(
        <StripRowList
            emptyLabel="Nothing running."
            listId="test"
            renderRow={(row: { id: string; title: string }) => <span>{row.title}</span>}
            rows={[]}
        />
    );
    const filled = renderToStaticMarkup(
        <StripRowList
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
    expect(empty).toContain('item-card-group--strip-rows');
    expect(filled).toContain('item-card-group--strip-rows');
    expect(filled).toContain('Blippy is thinking');
    expect(filled).toContain('Tiny is reading');
    expect(filled).not.toContain('Nothing running.');
    expect(filled).not.toContain('border-dashed');
});

test('rows animate layout only when the list itself changes, never on a resize render', () => {
    const rows = ['a', 'b', 'c'];
    // A resize re-render hands over a fresh array with the same members.
    expect(stripLayoutKey([...rows])).toBe(stripLayoutKey(rows));
    // Arrival, departure, and reorder each move the key.
    expect(stripLayoutKey([...rows, 'd'])).not.toBe(stripLayoutKey(rows));
    expect(stripLayoutKey(['a', 'c'])).not.toBe(stripLayoutKey(rows));
    expect(stripLayoutKey(['b', 'a', 'c'])).not.toBe(stripLayoutKey(rows));
    // The last row leaving hands over to the slot.
    expect(stripLayoutKey([])).not.toBe(stripLayoutKey(['a']));
});
