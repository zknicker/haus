import * as React from 'react';
import { clickTabId } from '../../features/shell/desktop-open-clicks.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { type OpenGesture, openIntentFromEvent } from '../desktop-tabs/tab-open-gesture.ts';

/** An App web link click: its URL, gesture, and the tab it was clicked in (null in window chrome). */
export interface WebLinkOpen {
    fromTabId: string | null;
    gesture: OpenGesture;
    url: string;
}

/**
 * Web links clicked in the App (an off-origin anchor, or any `target=_blank` web anchor: message
 * links, website and pull request chips) open as web tabs instead of navigating the App:
 * `open(request)`, with Chrome's dispositions (`tab-open-gesture.ts`). The source is the
 * link's own tab, not the focused one. Desktop only.
 */
export function useBrowserWorkspaceLinks(open: (request: WebLinkOpen) => void) {
    React.useEffect(() => {
        if (!getDesktopBridge()?.browserCommand) {
            return;
        }
        const onClick = (event: MouseEvent) => {
            const request = webLinkOpen(event, document.baseURI);
            if (request) {
                event.preventDefault();
                open(request);
            }
        };
        document.addEventListener('click', onClick);
        document.addEventListener('auxclick', onClick);
        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('auxclick', onClick);
        };
    }, [open]);
}

/**
 * The web link a left `click` or a middle `auxclick` opens, its gesture, and its tab; null for
 * any other button, a handled event, or an in-App link. `base` resolves relative hrefs and
 * names the App's origin.
 */
export function webLinkOpen(
    event: Pick<
        MouseEvent,
        'button' | 'ctrlKey' | 'defaultPrevented' | 'metaKey' | 'shiftKey' | 'target' | 'type'
    >,
    base: string
): WebLinkOpen | null {
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
    return { fromTabId: clickTabId(event), gesture: openIntentFromEvent(event), url: url.href };
}
