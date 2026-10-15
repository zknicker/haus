/**
 * How a public link serves a stored content type (specs/artifact-public-links.md). The stored
 * type is whatever the publisher declared, so it is mapped onto a short allowlist and never
 * served as HTML: markup becomes plain text, and anything unknown downloads.
 */
export interface PublicContent {
    contentType: string;
    disposition: 'inline' | 'attachment';
}

const inlineMedia = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
]);
const textTypes = new Set([
    'application/json',
    'application/xml',
    'application/yaml',
    'application/x-yaml',
    'application/javascript',
    'application/x-ndjson',
]);

export function publicContent(storedType: string): PublicContent {
    const mime = storedType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (inlineMedia.has(mime)) {
        return { contentType: mime, disposition: 'inline' };
    }
    if (mime.startsWith('text/') || textTypes.has(mime) || mime.endsWith('+json')) {
        return { contentType: 'text/plain; charset=utf-8', disposition: 'inline' };
    }
    return { contentType: 'application/octet-stream', disposition: 'attachment' };
}

/**
 * Headers every public response carries. The sandbox CSP stops script in a top-level SVG or
 * anything else rendered on the App origin. Browser PDF viewers refuse to render under a
 * restrictive or sandboxing CSP, and their own script runs isolated from the page, so PDFs go
 * without one.
 */
export function publicResponseHeaders(contentType: string): Record<string, string> {
    return {
        'cache-control': 'public, max-age=60',
        ...(contentType === 'application/pdf'
            ? {}
            : {
                  'content-security-policy':
                      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
              }),
        'cross-origin-resource-policy': 'cross-origin',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
    };
}
