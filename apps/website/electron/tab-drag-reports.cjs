'use strict';

// Validation for what renderers send a tab drag. The dragged tabs (one, or a
// multi-selection) travel as one bundle, `{ activeTabId, tabs }`. Tab records
// stay opaque here: the receiving renderer validates them; main only needs
// their ids and the web views their histories name.

const viewIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const serverIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
/** A window's worth of tabs; anything larger is not a real drag. */
const maxBundleTabs = 200;

function isRect(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) &&
        value.width >= 0 &&
        value.height >= 0
    );
}

function isPoint(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y)
    );
}

function isServerId(value) {
    return typeof value === 'string' && serverIdPattern.test(value);
}

function isTabRecord(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        Array.isArray(value.history?.entries)
    );
}

function isTabBundle(value) {
    if (
        !(
            value !== null &&
            typeof value === 'object' &&
            Array.isArray(value.tabs) &&
            value.tabs.length > 0 &&
            value.tabs.length <= maxBundleTabs &&
            value.tabs.every(isTabRecord)
        )
    ) {
        return false;
    }
    const ids = new Set(value.tabs.map((tab) => tab.id));
    return ids.size === value.tabs.length && ids.has(value.activeTabId);
}

function isStripReport(value) {
    return isServerId(value?.serverId) && isRect(value.rect);
}

function isDragStart(value) {
    return (
        isServerId(value?.serverId) && typeof value.route === 'string' && isTabBundle(value.bundle)
    );
}

function isDetachRequest(value) {
    return (
        isTabBundle(value?.bundle) &&
        typeof value.keepsWindow === 'boolean' &&
        isPoint(value.grab) &&
        isPoint(value.slot) &&
        (value.body === undefined || value.body === null || isPageBounds(value.body))
    );
}

/** A page's place in its window, CSS px from the content's top left, with an optional corner. */
function isPageBounds(value) {
    return (
        isRect(value) &&
        value.x >= 0 &&
        value.y >= 0 &&
        (value.radius === undefined || (Number.isFinite(value.radius) && value.radius >= 0))
    );
}

/** The live web views the bundle's tab histories name: they travel with them. */
function browserViewIds(bundle) {
    const ids = bundle.tabs
        .flatMap((tab) => tab.history.entries)
        .flatMap((entry) => {
            const location = entry?.location;
            return location?.kind === 'browser' && viewIdPattern.test(location.viewId ?? '')
                ? [location.viewId]
                : [];
        });
    return [...new Set(ids)];
}

/** The web view the bundle's active tab shows now, when its current history entry is a web page. */
function shownBrowserViewId(bundle) {
    const tab = bundle.tabs.find((candidate) => candidate.id === bundle.activeTabId);
    const location = tab?.history.entries[tab.history.index]?.location;
    return location?.kind === 'browser' && viewIdPattern.test(location.viewId ?? '')
        ? location.viewId
        : null;
}

module.exports = {
    browserViewIds,
    isDetachRequest,
    isDragStart,
    isStripReport,
    isTabBundle,
    shownBrowserViewId,
};
