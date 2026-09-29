import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserCommand } from '../../lib/desktop-browser.ts';

export function useBrowserWorkspaceLinks(command: (input: BrowserCommand) => void) {
    React.useEffect(() => {
        if (!getDesktopBridge()?.browserCommand) {
            return;
        }
        const onClick = (event: MouseEvent) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                !(event.target instanceof Element)
            ) {
                return;
            }
            const anchor = event.target.closest('a[href]');
            if (!(anchor instanceof HTMLAnchorElement)) {
                return;
            }
            const url = new URL(anchor.href);
            if (
                !['http:', 'https:'].includes(url.protocol) ||
                (anchor.target !== '_blank' && url.origin === location.origin)
            ) {
                return;
            }
            event.preventDefault();
            command({ kind: 'open', url: url.href });
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, [command]);
}
