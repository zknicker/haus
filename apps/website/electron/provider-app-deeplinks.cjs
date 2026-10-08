'use strict';

/**
 * Desktop-app deeplinks the renderer may hand to the system. Each entry is an
 * exact scheme + host + path, never a whole scheme, so a renderer cannot launch
 * arbitrary registered protocol handlers.
 */
const providerAppDeeplinks = [
    // Cursor's own background-agent deeplink; its bcId query names the run.
    { host: 'anysphere.cursor-deeplink', pathname: '/background-agent', protocol: 'cursor:' },
];

function isProviderAppDeeplink(value) {
    if (typeof value !== 'string') {
        return false;
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return providerAppDeeplinks.some(
        (allowed) =>
            url.protocol === allowed.protocol &&
            url.host === allowed.host &&
            url.pathname === allowed.pathname &&
            url.username === '' &&
            url.password === '' &&
            url.port === ''
    );
}

module.exports = { isProviderAppDeeplink };
