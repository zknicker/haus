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
 * tab, and popups, target=_blank, and modified clicks open browser tabs with
 * Chrome's dispositions — in the background for background-tab (⌘- or
 * middle-click), selected otherwise (foreground-tab: ⌘⇧-click, target=_blank;
 * new-window: ⇧-click, window.open). Chromium opens the new page itself
 * (`openPopup`), so a popup keeps its `window.opener` (sign-in popups post
 * their result back through it) and, as in Chrome, outlives its opener. When
 * no tab can take a popup page, the URL opens fresh (`openTab`). Mail links go
 * to the operating system; every other scheme is blocked.
 */
function installBrowserPageLinks(contents, { openExternal, openPopup, openTab, onNavigate }) {
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
            const background = disposition === 'background-tab';
            const createWindow = openPopup(url, { background });
            if (createWindow) {
                return { action: 'allow', createWindow, outlivesOpener: true };
            }
            openTab(url, { background });
        } else if (isMailUrl(url)) {
            void openExternal(url);
        }
        return { action: 'deny' };
    });
}

module.exports = { installBrowserPageLinks, isMailUrl, isWebUrl };
