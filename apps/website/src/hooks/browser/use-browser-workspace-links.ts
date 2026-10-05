import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { type OpenGesture, openIntentFromEvent } from '../desktop-tabs/tab-open-gesture.ts';

/**
 * Web links clicked in the App (an off-origin anchor, or any `target=_blank` web anchor: message
 * links, website and pull request chips) open as web tabs instead of navigating the App:
 * `open(url, gesture)`, with Chrome's dispositions (`tab-open-gesture.ts`): Command- or
 * middle-click opens it in the background, Shift (alone or with Command) selected, a plain
 * click by the window's rule. Desktop only.
 */
export function useBrowserWorkspaceLinks(open: (url: string, gesture: OpenGesture) => void) {
    React.useEffect(() => {
        if (!getDesktopBridge()?.browserCommand) {
            return;
        }
        // A middle press on a web link must not start autoscroll.
        const press = (event: MouseEvent) => {
            if (event.button === 1 && webLinkOpen(event, document.baseURI)) {
                event.preventDefault();
            }
        };
        const onClick = (event: MouseEvent) => {
            const request = webLinkOpen(event, document.baseURI);
            if (request) {
                event.preventDefault();
                open(request.url, request.gesture);
            }
        };
        document.addEventListener('mousedown', press);
        document.addEventListener('click', onClick);
        document.addEventListener('auxclick', onClick);
        return () => {
            document.removeEventListener('mousedown', press);
            document.removeEventListener('click', onClick);
            document.removeEventListener('auxclick', onClick);
        };
    }, [open]);
}

/**
 * The web link a left `click` or a middle press (`mousedown`, `auxclick`) opens, and its
 * gesture; null for any other button, a handled event, or an in-App link. `base` resolves
 * relative hrefs and names the App's origin.
 */
export function webLinkOpen(
    event: Pick<
        MouseEvent,
        'button' | 'ctrlKey' | 'defaultPrevented' | 'metaKey' | 'shiftKey' | 'target' | 'type'
    >,
    base: string
): { gesture: OpenGesture; url: string } | null {
    const button = event.type === 'click' ? 0 : 1;
    if (event.defaultPrevented || event.button !== button) {
        return null;
    }
    const anchor = (event.target as Partial<Element> | null)?.closest?.('a[href]');
    const href = anchor?.getAttribute('href');
    if (!(anchor && href)) {
        return null;
    }
    const url = URL.parse(href, base);
    if (
        !(url && ['http:', 'https:'].includes(url.protocol)) ||
        (anchor.getAttribute('target') !== '_blank' && url.origin === new URL(base).origin)
    ) {
        return null;
    }
    return { gesture: openIntentFromEvent(event), url: url.href };
}
