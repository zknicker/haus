'use strict';

function reorderBrowserTabs(tabs, ids) {
    if (
        !Array.isArray(ids) ||
        ids.length !== tabs.size ||
        new Set(ids).size !== tabs.size ||
        ids.some((id) => !tabs.has(id))
    ) {
        throw new Error('Tab order must include every open browser tab exactly once.');
    }
    const ordered = ids.map((id) => [id, tabs.get(id)]);
    tabs.clear();
    for (const [id, tab] of ordered) {
        tabs.set(id, tab);
    }
}

module.exports = { reorderBrowserTabs };
