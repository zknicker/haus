import { getDesktopBridge } from './desktop-bridge.ts';

/**
 * Open HTTP(S) links in the desktop workspace when supported. Web clients
 * and older installed shells retain their external-browser behavior.
 */
export async function openExternalLink(url: string) {
    const bridge = getDesktopBridge();

    if (bridge?.browserCommand && ['http:', 'https:'].includes(new URL(url).protocol)) {
        await bridge.browserCommand({ kind: 'open', url });
        return;
    }
    await openSystemBrowserLink(url);
}

/** Authentication flows use the human's existing system-browser session. */
export async function openSystemBrowserLink(url: string) {
    const bridge = getDesktopBridge();
    if (bridge) {
        await bridge.openExternal(url);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
