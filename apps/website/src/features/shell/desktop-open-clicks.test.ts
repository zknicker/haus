import { expect, test } from 'bun:test';
import { openWithGesture } from '../../hooks/desktop-tabs/tab-navigation.ts';
import {
    currentOpenGesture,
    opensPlaceAttribute,
    trackOpenGestures,
} from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import {
    clickTabId,
    newTabLink,
    openNewTabLink,
    preventsMiddlePress,
    relayPlaceClick,
} from './desktop-open-clicks.ts';

const modifier = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

function click(init: Partial<MouseEvent>, target: unknown) {
    return {
        button: 0,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        preventDefault: () => undefined,
        shiftKey: false,
        target,
        type: 'click',
        ...init,
    } as unknown as MouseEvent;
}

/** A fake element: `attributes` answer `closest` selectors that mention them. */
function element(attributes: Record<string, string>, onClick: () => void = () => undefined) {
    const self = {
        click: onClick,
        closest: (selector: string) =>
            Object.keys(attributes).some((name) => selector.includes(name)) ? self : null,
        getAttribute: (name: string) => attributes[name] ?? null,
    };
    return self;
}

test('Command- and middle-click on an in-Server link name a background tab; Shift a selected one', () => {
    const anchor = (href: string) => element({ href });
    const inbox = { kind: 'app', path: '/s/acme/inbox' } as const;
    expect(newTabLink(click(modifier, anchor('#/s/acme/chats/c2')), '/s/acme')).toEqual({
        background: true,
        location: { kind: 'app', path: '/s/acme/chats/c2' },
    });
    expect(
        newTabLink(click({ ...modifier, shiftKey: true }, anchor('/s/acme/inbox')), '/s/acme')
    ).toEqual({ background: false, location: inbox });
    expect(
        newTabLink(click({ button: 1, type: 'auxclick' }, anchor('/s/acme/inbox')), '/s/acme')
    ).toEqual({ background: true, location: inbox });
    // Middle-click on a sidebar row (a `data-href` item) opens a tab; its left clicks are React Aria's.
    const row = element({ 'data-href': '/s/acme/inbox' });
    expect(newTabLink(click({ button: 1, type: 'auxclick' }, row), '/s/acme')).toEqual({
        background: true,
        location: inbox,
    });
    expect(newTabLink(click(modifier, row), '/s/acme')).toBeNull();
    expect(newTabLink(click({}, anchor('/s/acme/inbox')), '/s/acme')).toBeNull();
    expect(newTabLink(click(modifier, anchor('https://example.com')), '/s/acme')).toBeNull();
    expect(newTabLink(click(modifier, anchor('/s/other/inbox')), '/s/acme')).toBeNull();
});

test('a new-tab link opens beside its own tab; from window chrome beside the left pane’s', () => {
    const calls: unknown[][] = [];
    const tabs = { openTab: (...args: unknown[]) => calls.push(args) };
    const link = { background: true, location: { kind: 'app', path: '/s/acme/inbox' } } as const;
    const inTab = element({ 'data-desktop-tab-id': 't2', href: '/s/acme/inbox' });
    openNewTabLink(tabs, link, clickTabId(click({}, inTab)));
    openNewTabLink(tabs, link, clickTabId(click({}, element({ href: '/s/acme/inbox' }))));
    expect(calls).toEqual([
        ['t2', link.location, { background: true }],
        [null, link.location, { background: true }],
    ]);
});

test('middle-click on a plain onClick button that opens a page (an Inbox row) opens a background tab', () => {
    const listeners = new Map<string, (event: Event) => void>();
    const uninstall = trackOpenGestures({
        addEventListener: (type: string, listener: (event: Event) => void) =>
            listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window);
    const calls: unknown[][] = [];
    const tabs = {
        open: (...args: unknown[]) => calls.push(['open', ...args]),
        openTab: (...args: unknown[]) => calls.push(['openTab', ...args]),
    };
    const chat = { kind: 'app', path: '/s/acme/chats/c1' } as const;
    // The row's own handler: no event threading, it reads the in-flight gesture.
    const row = element({ [opensPlaceAttribute]: '', 'data-desktop-tab-id': 't0' }, () =>
        openWithGesture(tabs, 't0', chat, currentOpenGesture())
    );
    const auxclick = click({ button: 1, isTrusted: true, type: 'auxclick' }, row);
    listeners.get('auxclick')?.(auxclick);
    expect(preventsMiddlePress(auxclick)).toBe(true);
    expect(relayPlaceClick(auxclick)).toBe(true);
    // A row without the attribute (a Delete button) is never clicked by a middle click.
    expect(relayPlaceClick(click({ button: 1, type: 'auxclick' }, element({})))).toBe(false);
    uninstall();
    expect(calls).toEqual([['openTab', 't0', chat, { background: true }]]);
});
