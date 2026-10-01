import { mcpIconMaxBytes } from '@haus/api';

/**
 * Turning fetched or advertised icon bytes into a contract-ready data URL.
 * The declared media type has to match the bytes' own signature, or the icon
 * is discarded — a server cannot label HTML or SVG as a PNG and get it inlined.
 */

/**
 * Raster only. SVG is the one format that can carry script or pull
 * subresources, and screening it needs a parser rather than a token blocklist —
 * so it is refused outright and such a server falls through to its favicon.
 */
export const iconMediaTypes = new Map<string, string>([
    ['image/jpeg', 'image/jpeg'],
    ['image/jpg', 'image/jpeg'],
    ['image/png', 'image/png'],
    ['image/vnd.microsoft.icon', 'image/x-icon'],
    ['image/webp', 'image/webp'],
    ['image/x-icon', 'image/x-icon'],
]);

export function readDataUrl(src: string): string | null {
    const match = /^data:([^;,]+);base64,(.*)$/su.exec(src);
    if (!match) {
        return null;
    }
    const mediaType = normalizeMediaType(match[1]);
    try {
        return encodeIcon(Uint8Array.from(Buffer.from(match[2] ?? '', 'base64')), mediaType);
    } catch {
        return null;
    }
}

export function encodeFetchedIcon(bytes: Uint8Array, mediaType: string | null): string | null {
    return encodeIcon(bytes, normalizeMediaType(mediaType));
}

function encodeIcon(bytes: Uint8Array, mediaType: null | string): string | null {
    if (!mediaType || bytes.byteLength === 0 || bytes.byteLength > mcpIconMaxBytes) {
        return null;
    }
    const resolved = rasterMediaType(bytes);
    if (!resolved || resolved !== mediaType) {
        return null;
    }
    return `data:${resolved};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** The declared type has to match the bytes, or the icon is discarded. */
function rasterMediaType(bytes: Uint8Array): null | string {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'image/png';
    }
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return 'image/jpeg';
    }
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && readAscii(bytes, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
        return 'image/x-icon';
    }
    return null;
}

function normalizeMediaType(value: null | string | undefined): null | string {
    if (!value) {
        return null;
    }
    return iconMediaTypes.get(value.split(';')[0]?.trim().toLowerCase() ?? '') ?? null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    return (
        bytes.byteLength >= signature.length &&
        signature.every((byte, index) => bytes[index] === byte)
    );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}
