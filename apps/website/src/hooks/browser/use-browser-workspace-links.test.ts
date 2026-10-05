import { describe, expect, test } from 'bun:test';
import { webLinkOpen } from './use-browser-workspace-links.ts';

const base = 'http://localhost:43444/#/s/acme/inbox';
const command = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

/** A message link or a website/pull request chip: an anchor, `target=_blank` by default. */
function anchor(href: string, target: string | null = '_blank') {
    const element = {
        getAttribute: (name: string) =>
            name === 'href' ? href : name === 'target' ? target : null,
    };
    return { closest: (selector: string) => (selector === 'a[href]' ? element : null) };
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
        const url = 'https://example.com/a';
        expect(webLinkOpen(event({}), base)).toEqual({ gesture: 'auto', url });
        expect(webLinkOpen(event(command), base)).toEqual({ gesture: 'backgroundTab', url });
        expect(webLinkOpen(event({ button: 1, type: 'auxclick' }), base)).toEqual({
            gesture: 'backgroundTab',
            url,
        });
        expect(webLinkOpen(event({ ...command, shiftKey: true }), base)).toEqual({
            gesture: 'newTab',
            url,
        });
        expect(webLinkOpen(event({ shiftKey: true }), base)).toEqual({ gesture: 'newTab', url });
    });

    test('a middle press is caught so it never autoscrolls', () => {
        expect(webLinkOpen(event({ button: 1, type: 'mousedown' }), base)).not.toBeNull();
        expect(webLinkOpen(event({ button: 0, type: 'mousedown' }), base)).toBeNull();
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
            gesture: 'auto',
            url: 'https://example.org/',
        });
    });
});
