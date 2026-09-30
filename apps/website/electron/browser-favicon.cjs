'use strict';

// The App renders favicons as plain images, so only web and inline image URLs cross the bridge.
const faviconPattern = /^(https?:\/\/|data:image\/)/i;

/**
 * Keeps a browser tab's `faviconUrl` in step with its page. A new document
 * clears the old icon; the page then announces its own after loading.
 * Register before listeners that publish on `did-navigate`.
 */
function trackBrowserFavicon(contents, state, update) {
    contents.on('did-navigate', () => {
        state.faviconUrl = null;
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
        state.faviconUrl = favicons.find((value) => faviconPattern.test(value)) ?? null;
        update();
    });
}

module.exports = { trackBrowserFavicon };
