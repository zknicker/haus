import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatTopbarIdentity, ChatTopbarMeta } from './chat-topbar.tsx';

test('omits live Agent availability copy from the DM topbar', () => {
    const markup = renderToStaticMarkup(
        <ChatTopbarMeta chat={{ archivedAt: null, kind: 'dm', peerAgentRetired: false }} />
    );

    expect(markup).toBe('');
});

test('keeps durable chat states in the topbar', () => {
    const retired = renderToStaticMarkup(
        <ChatTopbarMeta chat={{ archivedAt: null, kind: 'dm', peerAgentRetired: true }} />
    );
    const archived = renderToStaticMarkup(
        <ChatTopbarMeta
            chat={{
                archivedAt: '2026-08-25T12:00:00.000Z',
                kind: 'channel',
                peerAgentRetired: false,
            }}
        />
    );

    expect(retired).toContain('Retired');
    expect(archived).toContain('Archived');
});

test('renders the web chat identity as a static heading, not a control', () => {
    const markup = renderToStaticMarkup(
        <ChatTopbarIdentity mark={<span data-mark="" />} name="general" />
    );

    expect(markup).toContain('<h1');
    expect(markup).toContain('general');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('tabindex');
});
