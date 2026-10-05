'use strict';

const { trackBrowserFavicon } = require('./browser-favicon.cjs');
const { trackFindInPage } = require('./browser-page-actions.cjs');

const stateEvents = [
    'did-start-loading',
    'did-stop-loading',
    'did-navigate',
    'did-navigate-in-page',
    'page-title-updated',
];

/**
 * Keeps a browser tab's published `state` in step with its page: address,
 * title, loading, history, zoom, favicon, find matches, and load failures.
 * `isLive` turns false once the tab closes.
 */
function trackBrowserTabState(contents, state, { fallbackUrl, isLive, publish }) {
    const update = () => {
        if (!isLive() || contents.isDestroyed()) {
            return;
        }
        state.url = contents.getURL() || fallbackUrl;
        state.title = contents.getTitle() || new URL(state.url).hostname;
        state.loading = contents.isLoading();
        state.canGoBack = contents.navigationHistory.canGoBack();
        state.canGoForward = contents.navigationHistory.canGoForward();
        state.zoomFactor = contents.getZoomFactor();
        publish();
    };
    trackBrowserFavicon(contents, state, update);
    trackFindInPage(contents, state, publish);
    for (const event of stateEvents) {
        contents.on(event, update);
    }
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
            state.error = description;
            update();
        }
    });
    contents.on('render-process-gone', () => {
        state.error = 'This page stopped responding. Reload to try again.';
        state.loading = false;
        publish();
    });
}

module.exports = { trackBrowserTabState };
