'use strict';

const { browserUrl } = require('./browser-url.cjs');
const { isExternalBrowserUrl } = require('./external-link-handlers.cjs');

function isWebUrl(value) {
    try {
        browserUrl(value);
        return true;
    } catch {
        return false;
    }
}

/** Mail links leave for the operating system; no other non-web scheme leaves a page. */
function isMailUrl(value) {
    return isExternalBrowserUrl(value) && new URL(value).protocol === 'mailto:';
}

/**
 * Links inside a page. Web targets stay in Haus: navigation continues in the
 * tab, and popups, target=_blank, and ⌘/middle-clicks open browser tabs —
 * in the background for a background-tab disposition (⌘-click), selected
 * otherwise (⌘⇧-click, target=_blank, window.open). Mail links go to the
 * operating system; every other scheme is blocked.
 */
function installBrowserPageLinks(contents, { openExternal, openTab, onNavigate }) {
    const guard = (event, target, userNavigation) => {
        if (isWebUrl(target)) {
            onNavigate();
            return;
        }
        event.preventDefault();
        if (userNavigation && isMailUrl(target)) {
            void openExternal(target);
        }
    };
    contents.on('will-navigate', (event, target) => guard(event, target, true));
    contents.on('will-redirect', (event, target) => guard(event, target, false));
    contents.setWindowOpenHandler(({ url, disposition }) => {
        if (isWebUrl(url)) {
            openTab(url, { background: disposition === 'background-tab' });
        } else if (isMailUrl(url)) {
            void openExternal(url);
        }
        return { action: 'deny' };
    });
}

module.exports = { installBrowserPageLinks, isMailUrl, isWebUrl };
