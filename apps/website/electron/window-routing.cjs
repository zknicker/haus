'use strict';

// Pure helpers for multi-window routing/placement. Kept free of electron imports so
// they can be unit-tested without launching the app.

// Top-level in-app route prefixes (mirrors lib/app-routes.ts and lib/server-routes.ts; this
// file is plain CJS and cannot import the TS source). Only routes under one of these may seed
// a new window: Server routes (`/s/<slug>/…`) and the legacy unscoped prefixes the App
// redirects into a Server.
const appRoutePrefixes = [
    '/activity',
    '/chats',
    '/design',
    '/members',
    '/reminders',
    '/search',
    '/tasks',
    '/settings',
];
const serverRoutePattern = /^\/s\/[A-Za-z0-9._~-]+(?:[/?#]|$)/u;
const routeProbeOrigin = 'https://haus.invalid';
const defaultWindowWidth = 1440;
const defaultWindowHeight = 960;
const defaultWindowOffsetPx = 36;

/**
 * Only same-origin App routes may seed a new window: a Server route or a known
 * prefix (on a segment boundary), with no backslash or control character that
 * could resolve to another origin.
 */
function isSafeWindowRoute(route) {
    if (typeof route !== 'string' || /[\\\u0000-\u001f]/u.test(route)) {
        return false;
    }
    const known =
        serverRoutePattern.test(route) ||
        appRoutePrefixes.some(
            (prefix) => route.startsWith(prefix) && /^(?:[/?#]|$)/u.test(route.slice(prefix.length))
        );
    return known && new URL(route, routeProbeOrigin).origin === routeProbeOrigin;
}

/** Offsets each new window from its opener (or screen-centered default) so they don't stack. */
function nextWindowBounds(openerBounds, options = {}) {
    const offset = options.offset ?? defaultWindowOffsetPx;
    const width = options.width ?? defaultWindowWidth;
    const height = options.height ?? defaultWindowHeight;

    if (!openerBounds) {
        return { width, height, x: undefined, y: undefined };
    }

    return {
        width: openerBounds.width,
        height: openerBounds.height,
        x: openerBounds.x + offset,
        y: openerBounds.y + offset,
    };
}

/** Builds the hosted or dev Haus App URL for a seeded route, or the bare App origin. */
function buildWindowUrl(appUrl, route) {
    return route ? new URL(route, appUrl).toString() : appUrl;
}

module.exports = {
    buildWindowUrl,
    isSafeWindowRoute,
    nextWindowBounds,
};
