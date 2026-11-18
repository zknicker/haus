import { describe, expect, test } from 'bun:test';
import { webLinkOpen } from './use-browser-workspace-links.ts';

const base = 'http://localhost:43444/#/s/acme/inbox';
const command = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

/**
 * A message link or a website/pull request chip: an anchor, `target=_blank` by default,
 * inside the tab frame `tabId` (null: window chrome).
 */
function anchor(href: string, target: string | null = '_blank', tabId: string | null = 't2') {
    const element = {
        getAttribute: (name: string) =>
            name === 'href' ? href : name === 'target' ? target : null,
    };
    const frame = {
        getAttribute: (name: string) => (name === 'data-desktop-tab-id' ? tabId : null),
    };
    return {
        closest: (selector: string) => {
            if (selector === 'a[href]') {
                return element;
            }
            return selector.includes('[data-desktop-tab-id]') && tabId ? frame : null;
        },
    };
}

function event(init: Partial<MouseEvent>, target: unknown = anchor('https://example.com/a')) {
    return {
        button: 0,
        ctrlKey: false,
        defaultPrevented: false,
        metaKey: false,
        shiftKey: false,
        target,
        type: 'click',
        ...init,
    } as MouseEvent;
}

describe('webLinkOpen', () => {
    test("App web links and chips follow Chrome's dispositions", () => {
        const link = { fromTabId: 't2', url: 'https://example.com/a' };
        expect(webLinkOpen(event({}), base)).toEqual({ ...link, gesture: 'auto' });
        expect(webLinkOpen(event(command), base)).toEqual({ ...link, gesture: 'backgroundTab' });
        expect(webLinkOpen(event({ button: 1, type: 'auxclick' }), base)).toEqual({
            ...link,
            gesture: 'backgroundTab',
        });
        expect(webLinkOpen(event({ ...command, shiftKey: true }), base)).toEqual({
            ...link,
            gesture: 'newTab',
        });
        expect(webLinkOpen(event({ shiftKey: true }), base)).toEqual({
            ...link,
            gesture: 'newTab',
        });
    });

    test("the source is the link's own tab, not the focused one; window chrome has none", () => {
        const left = webLinkOpen(event({}, anchor('https://example.com/a', '_blank', 't0')), base);
        expect(left?.fromTabId).toBe('t0');
        const chrome = webLinkOpen(
            event({}, anchor('https://example.com/a', '_blank', null)),
            base
        );
        expect(chrome?.fromTabId).toBeNull();
    });

    test('in-App links, other schemes, other buttons, and handled clicks are left alone', () => {
        expect(webLinkOpen(event({}, anchor('#/s/acme/tasks', null)), base)).toBeNull();
        expect(webLinkOpen(event({}, anchor('mailto:hi@example.com')), base)).toBeNull();
        expect(webLinkOpen(event({ button: 2, type: 'auxclick' }), base)).toBeNull();
        expect(webLinkOpen(event({ button: 1 }), base)).toBeNull();
        expect(webLinkOpen(event({ defaultPrevented: true }), base)).toBeNull();
        expect(webLinkOpen(event({}, { closest: () => null }), base)).toBeNull();
    });

    test('an off-origin link opens even without target=_blank', () => {
        expect(webLinkOpen(event({}, anchor('https://example.org/', null)), base)).toEqual({
            fromTabId: 't2',
            gesture: 'auto',
            url: 'https://example.org/',
        });
    });
});
