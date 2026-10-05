'use strict';

const { isExternalBrowserUrl } = require('./external-link-handlers.cjs');
const { isWebUrl } = require('./browser-page-links.cjs');

const searchLabelLength = 32;

/**
 * The native right-click menu for a page, built from Electron's
 * `context-menu` params. A link, image, selection, or editable field gets its
 * own actions; a bare page gets Back, Forward, and Reload. Inspect Element
 * appears only in development builds.
 */
function browserPageMenuTemplate(params, { clipboard, contents, inspect, openExternal, openTab }) {
    const groups = [];
    const link = params.linkURL || '';
    const image = params.mediaType === 'image' ? params.srcURL || '' : '';
    const selection = (params.selectionText || '').replace(/\s+/g, ' ').trim();
    if (link) {
        groups.push([
            {
                label: 'Open Link in New Tab',
                enabled: isWebUrl(link),
                click: () => openTab(link, { background: true }),
            },
            {
                label: 'Open Link in Default Browser',
                enabled: isExternalBrowserUrl(link),
                click: () => void openExternal(link),
            },
            { label: 'Copy Link Address', click: () => clipboard.writeText(link) },
        ]);
    }
    if (image) {
        groups.push([
            {
                label: 'Open Image in New Tab',
                enabled: isWebUrl(image),
                click: () => openTab(image, { background: true }),
            },
            { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
        ]);
    }
    if (params.isEditable) {
        const flags = params.editFlags ?? {};
        groups.push([
            { label: 'Cut', enabled: Boolean(flags.canCut), click: () => contents.cut() },
            { label: 'Copy', enabled: Boolean(flags.canCopy), click: () => contents.copy() },
            { label: 'Paste', enabled: Boolean(flags.canPaste), click: () => contents.paste() },
            {
                label: 'Select All',
                enabled: Boolean(flags.canSelectAll),
                click: () => contents.selectAll(),
            },
        ]);
    } else if (selection) {
        groups.push([
            { label: 'Copy', click: () => contents.copy() },
            {
                label: `Search Google for “${truncate(selection)}”`,
                click: () =>
                    openTab(`https://www.google.com/search?q=${encodeURIComponent(selection)}`, {
                        background: false,
                    }),
            },
        ]);
    }
    if (groups.length === 0) {
        const history = contents.navigationHistory;
        groups.push([
            {
                label: 'Back',
                enabled: history.canGoBack(),
                click: () => history.goBack(),
            },
            {
                label: 'Forward',
                enabled: history.canGoForward(),
                click: () => history.goForward(),
            },
            { label: 'Reload', click: () => contents.reload() },
        ]);
    }
    if (inspect) {
        groups.push([
            {
                label: 'Inspect Element',
                click: () => contents.inspectElement(params.x, params.y),
            },
        ]);
    }
    return groups.flatMap((group, index) =>
        index === 0 ? group : [{ type: 'separator' }, ...group]
    );
}

/** `ownerWindow()` is read per menu: a page dragged to another window pops its menu there. */
function installBrowserPageMenu(contents, ownerWindow, { Menu, ...actions }) {
    contents.on('context-menu', (_event, params) => {
        const template = browserPageMenuTemplate(params, { contents, ...actions });
        Menu.buildFromTemplate(template).popup({ window: ownerWindow() });
    });
}

function truncate(value) {
    return value.length > searchLabelLength ? `${value.slice(0, searchLabelLength - 1)}…` : value;
}

module.exports = { browserPageMenuTemplate, installBrowserPageMenu };
