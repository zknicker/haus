/** Width, height, and media type read from image header bytes; null when the format is unknown. */
export function readImageHeader(
    bytes: Uint8Array
): { height: number; mediaType: string; width: number } | null {
    return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}

function readPng(bytes: Uint8Array) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { height: view.getUint32(20), mediaType: 'image/png', width: view.getUint32(16) };
}

function readJpeg(bytes: Uint8Array) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1];
        // Start-of-frame markers carry the size; 0xc4, 0xc8, and 0xcc are not frames.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return {
                height: view.getUint16(offset + 5),
                mediaType: 'image/jpeg',
                width: view.getUint16(offset + 7),
            };
        }
        offset += 2 + view.getUint16(offset + 2);
    }
    return null;
}

function readWebp(bytes: Uint8Array) {
    const tag = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4));
    if (bytes.length < 30 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') {
        return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunk = tag(12);
    if (chunk === 'VP8X') {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { height, mediaType: 'image/webp', width };
    }
    if (chunk === 'VP8L') {
        const bits = view.getUint32(21, true);
        return {
            height: 1 + ((bits >> 14) & 0x3f_ff),
            mediaType: 'image/webp',
            width: 1 + (bits & 0x3f_ff),
        };
    }
    if (chunk === 'VP8 ') {
        return {
            height: view.getUint16(28, true) & 0x3f_ff,
            mediaType: 'image/webp',
            width: view.getUint16(26, true) & 0x3f_ff,
        };
    }
    return null;
}
