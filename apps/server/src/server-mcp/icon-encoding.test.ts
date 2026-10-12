import { expect, test } from 'bun:test';
import { encodeFetchedIcon } from './icon-encoding.ts';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test.each([
    'image/x-icon',
    'image/vnd.microsoft.icon',
])('stores a PNG favicon served as %s with its actual media type', (mediaType) => {
    expect(encodeFetchedIcon(pngBytes, mediaType)).toBe(
        `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`
    );
});

test.each([
    '<html>challenge</html>',
    '<svg viewBox="0 0 1 1"/>',
])('rejects non-raster favicon bytes: %s', (body) => {
    expect(encodeFetchedIcon(new TextEncoder().encode(body), 'image/x-icon')).toBeNull();
});

test.each([
    'text/html',
    'image/svg+xml',
    'image/jpeg',
])('does not extend the favicon exception to %s', (mediaType) => {
    expect(encodeFetchedIcon(pngBytes, mediaType)).toBeNull();
});
