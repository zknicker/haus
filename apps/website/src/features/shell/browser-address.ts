/** What address-field text does when committed: open a web address, or search for the text. */
export type BrowserAddressIntent = { kind: 'go'; url: string } | { kind: 'search'; url: string };

/** Turns address-field text into a URL: explicit schemes pass through, hosts get https, the rest searches. */
export function resolveBrowserAddress(value: string) {
    return classifyBrowserAddress(value).url;
}

export function classifyBrowserAddress(value: string): BrowserAddressIntent {
    // `localhost:3000` also parses as a scheme, so a host with a port is checked first.
    if (/^[\w.-]+:\d+(?:[/?#]|$)/.test(value) || /^localhost(?:[/?#]|$)/i.test(value)) {
        const scheme = /^(?:localhost|127\.0\.0\.1)\b/i.test(value) ? 'http' : 'https';
        return { kind: 'go', url: `${scheme}://${value}` };
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
        return { kind: 'go', url: value };
    }
    if (!/\s/.test(value) && value.includes('.')) {
        return { kind: 'go', url: `https://${value}` };
    }
    return { kind: 'search', url: `https://www.google.com/search?q=${encodeURIComponent(value)}` };
}

/**
 * The resting address label: host and path, without scheme, `www.`, credentials, query, hash, or a
 * trailing slash. A blank page reads as empty so the placeholder shows. IDN hosts stay in punycode,
 * the form the URL parser returns, so a lookalike domain cannot pass as the real one.
 */
export function formatBrowserDisplayUrl(url: string) {
    if (url === '' || url === 'about:blank') {
        return '';
    }
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return url;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return url;
    }
    const host = parsed.host.replace(/^www\./i, '');
    const path = decodePath(parsed.pathname).replace(/\/+$/, '');
    return `${host}${path}`;
}

function decodePath(pathname: string) {
    try {
        return decodeURI(pathname);
    } catch {
        return pathname;
    }
}
