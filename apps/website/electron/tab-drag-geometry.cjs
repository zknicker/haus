'use strict';

// Pure geometry for dragging a tab between windows (ADR 0039). Screen points
// are Electron DIPs; renderer rects and points are CSS px, scaled by the
// window's zoom. Kept free of electron imports so it can be unit-tested.

/** Air above and below a band that still counts as over it. */
const stripHitSlopPx = 6;

/** A window's band on screen, from its content bounds and its renderer-reported client rect. */
function stripScreenRect(content, rect, zoom = 1) {
    return {
        x: content.x + rect.x * zoom,
        y: content.y + rect.y * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
    };
}

/** A screen point in a window's client CSS px. */
function clientPoint(content, point, zoom = 1) {
    return { x: (point.x - content.x) / zoom, y: (point.y - content.y) / zoom };
}

/**
 * The window whose band the cursor is over, or null. `windows` run front to
 * back as `{ id, content, strip, serverId, zoom }` (`strip`: the band's client
 * rect, or null). Only the front window under the cursor counts, so a band
 * hidden behind another window is no target, and a band on another Server
 * refuses the tab. `excludeId` (the floating window) is looked through.
 */
function bandUnderCursor(windows, point, { excludeId, serverId }) {
    const front = windows.find(
        (entry) =>
            entry.id !== excludeId && (contains(entry.content, point, 0) || overBand(entry, point))
    );
    if (!(front && overBand(front, point) && front.serverId === serverId)) {
        return null;
    }
    return front.id;
}

/**
 * Where the grab point sits inside a window frame: the frame-to-content
 * inset, then the tab's slot and the grab offset inside the tab, scaled.
 */
function grabAnchor({ frame, content, zoom = 1 }, slot, grab) {
    return {
        x: content.x - frame.x + (slot.x + grab.x) * zoom,
        y: content.y - frame.y + (slot.y + grab.y) * zoom,
    };
}

/** A floating window's frame: the anchor under the cursor, its size kept. */
function floatingBounds(point, anchor, size) {
    return {
        x: Math.round(point.x - anchor.x),
        y: Math.round(point.y - anchor.y),
        width: size.width,
        height: size.height,
    };
}

function overBand(entry, point) {
    if (!entry.strip) {
        return false;
    }
    return contains(stripScreenRect(entry.content, entry.strip, entry.zoom), point, stripHitSlopPx);
}

function contains(rect, point, slop) {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y - slop &&
        point.y <= rect.y + rect.height + slop
    );
}

module.exports = { bandUnderCursor, clientPoint, floatingBounds, grabAnchor, stripScreenRect };
