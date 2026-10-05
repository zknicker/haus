'use strict';

function assertTrustedRenderer(event, appUrl) {
    const senderUrl = event.senderFrame?.url ?? event.sender?.getURL?.();
    if (!isTrustedRendererUrl(senderUrl, appUrl)) {
        throw new Error('Untrusted page cannot use the Haus desktop bridge.');
    }
}

/**
 * The App window whose main frame sent `event`, or throws `message`. Origin
 * alone is insufficient: a browser page may visit the App origin. Frames
 * compare by stable `frameTreeNodeId`, not WebFrameMain object identity; a
 * missing frame fails closed.
 */
function appWindowOf(event, { appUrl, BrowserWindow, message }) {
    assertTrustedRenderer(event, appUrl);
    const window = BrowserWindow.fromWebContents(event.sender);
    const frame = event.senderFrame;
    const mainFrame = event.sender?.mainFrame;
    if (
        !(window && frame && mainFrame) ||
        window.webContents !== event.sender ||
        !Number.isInteger(frame.frameTreeNodeId) ||
        frame.frameTreeNodeId !== mainFrame.frameTreeNodeId
    ) {
        throw new Error(message);
    }
    return window;
}

function isTrustedRendererUrl(value, appUrl) {
    const url = parseUrl(value);
    const app = parseUrl(appUrl);
    return Boolean(url && app && url.origin === app.origin);
}

function parseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

module.exports = { appWindowOf, assertTrustedRenderer, isTrustedRendererUrl };
