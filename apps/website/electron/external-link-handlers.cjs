'use strict';

const externalBrowserProtocols = new Set(['http:', 'https:', 'mailto:']);

function registerExternalLinkHandlers(window, options) {
    const { appUrl, openBrowser, openExternal } = options;
    const openLink = (url) => {
        if (openBrowser && ['http:', 'https:'].includes(parseUrl(url)?.protocol)) {
            try {
                openBrowser(url);
            } catch {
                void openExternal(url);
            }
        } else {
            void openExternal(url);
        }
    };

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalBrowserUrl(url)) {
            openLink(url);
        }

        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
        if (isAppNavigationUrl(url, appUrl)) {
            return;
        }

        event.preventDefault();

        if (isExternalBrowserUrl(url)) {
            openLink(url);
        }
    });
}

function isExternalBrowserUrl(value) {
    const url = parseUrl(value);
    return Boolean(url && externalBrowserProtocols.has(url.protocol));
}

function isAppNavigationUrl(value, appUrl) {
    const url = parseUrl(value);
    if (!url) {
        return false;
    }

    if (url.protocol === 'file:') {
        return true;
    }

    const app = parseUrl(appUrl);
    return Boolean(app && url.origin === app.origin);
}

function parseUrl(value) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

module.exports = {
    isAppNavigationUrl,
    isExternalBrowserUrl,
    registerExternalLinkHandlers,
};
