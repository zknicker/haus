'use strict';

const viewIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
// One page per pane today; the bound only rejects garbage from a confused renderer.
const maxPlacements = 8;

/** App-chosen view names: short, URL-safe tokens, so a stale or forged id is rejected early. */
function assertViewId(value) {
    if (typeof value !== 'string' || !viewIdPattern.test(value)) {
        throw new Error('Invalid browser view id.');
    }
    return value;
}

/**
 * Validates the App's placements (ADR 0039): every web view on screen, each
 * with its bounds in CSS px, at most one `focused`. Throws on malformed input.
 */
function parseBrowserPlacements(value) {
    if (!Array.isArray(value) || value.length > maxPlacements) {
        throw new Error('Invalid browser layout.');
    }
    const seen = new Set();
    let focused = 0;
    const placements = value.map((item) => {
        if (!(item && typeof item === 'object' && isBounds(item.bounds))) {
            throw new Error('Invalid browser bounds.');
        }
        const viewId = assertViewId(item.viewId);
        if (seen.has(viewId)) {
            throw new Error('A browser view can be placed once.');
        }
        seen.add(viewId);
        if (item.focused === true) {
            focused += 1;
        }
        return { viewId, bounds: item.bounds, focused: item.focused === true };
    });
    if (focused > 1) {
        throw new Error('Only one browser view can be focused.');
    }
    return placements;
}

/**
 * Shows each placed view at its bounds (scaled by the App's zoom and clamped to
 * the window) and hides every other view. Placements naming a view that is gone
 * are skipped: the App may place a view in the same tick it closes.
 */
function applyBrowserPlacements(window, views, placements) {
    const [width, height] = window.getContentSize();
    const zoom = window.webContents.getZoomFactor?.() ?? 1;
    const placed = new Map(placements.map((placement) => [placement.viewId, placement]));
    for (const [id, entry] of views) {
        const placement = placed.get(id);
        entry.view.setVisible(placement !== undefined);
        if (!placement) {
            continue;
        }
        const { bounds } = placement;
        const x = Math.min(width, Math.max(0, Math.round(bounds.x * zoom)));
        const y = Math.min(height, Math.max(0, Math.round(bounds.y * zoom)));
        entry.view.setBounds({
            x,
            y,
            width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))),
            height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))),
        });
        // Follows the shell card's corner (Canvas and Band window layouts); 0 is square.
        entry.view.setBorderRadius(Math.round((bounds.radius ?? 0) * zoom));
    }
}

function isBounds(value) {
    return Boolean(
        value &&
            ['x', 'y', 'width', 'height'].every(
                (key) => Number.isFinite(value[key]) && value[key] >= 0
            ) &&
            (value.radius === undefined || (Number.isFinite(value.radius) && value.radius >= 0))
    );
}

module.exports = { applyBrowserPlacements, assertViewId, parseBrowserPlacements };
