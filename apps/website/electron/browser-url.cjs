'use strict';

/** Browser tabs load only credential-free HTTP(S) pages; everything else fails at this boundary. */
function browserUrl(value) {
    if (typeof value !== 'string') {
        throw new Error('Enter an HTTP or HTTPS address.');
    }
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Only HTTP and HTTPS pages can open in Haus.');
    }
    return url.href;
}

module.exports = { browserUrl };
