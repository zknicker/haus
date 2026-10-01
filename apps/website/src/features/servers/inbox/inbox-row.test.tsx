import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxActionRow } from './inbox-row.tsx';

test('an action row ends on its badge, with the action between the meta and it', () => {
    const markup = renderToStaticMarkup(
        <InboxActionRow
            action={<button type="button">ACTION</button>}
            badge={<span>BADGE</span>}
            label="#all"
            meta={<span>META</span>}
            onOpen={() => undefined}
        >
            <span>BODY</span>
        </InboxActionRow>
    );

    const meta = markup.indexOf('META');
    const action = markup.indexOf('ACTION');
    const badge = markup.indexOf('BADGE');
    expect(meta).toBeLessThan(action);
    expect(action).toBeLessThan(badge);
    // The badge is the last thing in the row, so the action can never shift it.
    expect(markup.slice(badge)).not.toContain('<button');
});

test('the action is hidden at rest but keeps its box, and shows on hover or focus', () => {
    const markup = renderToStaticMarkup(
        <InboxActionRow
            action={<button type="button">ACTION</button>}
            badge={null}
            label="#all"
            meta={null}
            onOpen={() => undefined}
        >
            <span>BODY</span>
        </InboxActionRow>
    );
    const wrapper = markup.slice(0, markup.indexOf('ACTION'));
    const reveal = wrapper.slice(wrapper.lastIndexOf('<span'));

    // Opacity, not display: the box stays reserved so nothing moves on hover.
    expect(reveal).toContain('opacity-0');
    expect(reveal).not.toContain('hidden');
    expect(reveal).toContain('group-hover/inbox-row:opacity-100');
    expect(reveal).toContain('group-focus-within/inbox-row:opacity-100');
});
