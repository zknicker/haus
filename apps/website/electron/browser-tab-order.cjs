'use strict';

/**
 * Applies the App's strip order to the browser tabs. The App may send ids from
 * a snapshot a tab opened or closed since, so unknown and repeated ids are
 * ignored and tabs the order does not name keep their place after it.
 */
function reorderBrowserTabs(tabs, ids) {
    if (!Array.isArray(ids)) {
        throw new Error('Tab order must be a list of browser tab ids.');
    }
    const named = [...new Set(ids)].filter((id) => tabs.has(id));
    const rest = [...tabs.keys()].filter((id) => !named.includes(id));
    const ordered = [...named, ...rest].map((id) => [id, tabs.get(id)]);
    tabs.clear();
    for (const [id, tab] of ordered) {
        tabs.set(id, tab);
    }
}

module.exports = { reorderBrowserTabs };
