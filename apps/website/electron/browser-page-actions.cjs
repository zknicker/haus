'use strict';

const { browserUrl } = require('./browser-url.cjs');

/** Chrome's page zoom steps, as zoom factors. */
const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const epsilon = 0.001;

function nextZoomFactor(current, action) {
    if (action === 'zoom-in') {
        return zoomSteps.find((step) => step > current + epsilon) ?? zoomSteps.at(-1);
    }
    if (action === 'zoom-out') {
        return zoomSteps.findLast((step) => step < current - epsilon) ?? zoomSteps[0];
    }
    return 1;
}

/** Runs one navigate action on a tab's page; `state` is the tab's published state. */
function runPageAction(contents, state, input, publish) {
    const history = contents.navigationHistory;
    switch (input.action) {
        case 'back':
            if (history.canGoBack()) {
                history.goBack();
            }
            return;
        case 'forward':
            if (history.canGoForward()) {
                history.goForward();
            }
            return;
        case 'stop':
            contents.stop();
            return;
        case 'reload':
            state.error = null;
            contents.reload();
            return;
        case 'hard-reload':
            state.error = null;
            contents.reloadIgnoringCache();
            return;
        case 'zoom-in':
        case 'zoom-out':
        case 'zoom-reset':
            state.zoomFactor = nextZoomFactor(contents.getZoomFactor(), input.action);
            contents.setZoomFactor(state.zoomFactor);
            publish();
            return;
        case 'url': {
            const target = browserUrl(input.url);
            state.error = null;
            void contents.loadURL(target).catch((error) => {
                if (contents.isDestroyed() || error.code === 'ERR_ABORTED') {
                    return;
                }
                state.error = error.message;
                publish();
            });
            return;
        }
        default:
            throw new Error('Unknown browser navigation action.');
    }
}

/**
 * Find in page. A session starts with the first `find` and ends with
 * `stopFind`; match counts arriving after it ends are dropped.
 */
function trackFindInPage(contents, state, publish) {
    contents.on('found-in-page', (_event, result) => {
        if (state.find === null) {
            return;
        }
        state.find = {
            activeMatch: result.activeMatchOrdinal ?? state.find.activeMatch,
            matches: result.matches ?? state.find.matches,
        };
        publish();
    });
}

function findInPage(contents, state, input) {
    if (typeof input.text !== 'string' || input.text.length === 0 || input.text.length > 1000) {
        throw new Error('Enter text to find.');
    }
    state.find ??= { activeMatch: 0, matches: 0 };
    contents.findInPage(input.text, {
        forward: input.forward !== false,
        // Electron's `findNext` means "begin a new session".
        findNext: input.newSession === true,
    });
}

function stopFindInPage(contents, state, publish) {
    state.find = null;
    contents.stopFindInPage('clearSelection');
    publish();
}

module.exports = {
    findInPage,
    nextZoomFactor,
    runPageAction,
    stopFindInPage,
    trackFindInPage,
    zoomSteps,
};
