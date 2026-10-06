import path from 'node:path';

const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

/**
 * Media type for an uploaded file whose sender gave none. Content wins over the
 * name, because a generated image's extension is often wrong or missing; the
 * extension covers text formats with no signature. Apps render a mislabeled
 * image as a file card, so guessing well here is what makes it show inline.
 */
export function inferAttachmentMediaType(filePath: string, data: Uint8Array): string {
    return (
        sniffMediaType(data) ??
        EXTENSION_MEDIA_TYPES[path.extname(filePath).toLowerCase()] ??
        FALLBACK_MEDIA_TYPE
    );
}

export function sniffMediaType(data: Uint8Array): string | null {
    for (const signature of SIGNATURES) {
        if (signature.bytes.every((byte, index) => data[signature.offset + index] === byte)) {
            return signature.mediaType;
        }
    }
    if (startsWithAscii(data, 0, 'RIFF') && startsWithAscii(data, 8, 'WEBP')) {
        return 'image/webp';
    }
    return looksLikeSvg(data) ? 'image/svg+xml' : null;
}

const SIGNATURES: readonly { bytes: readonly number[]; mediaType: string; offset: number }[] = [
    { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mediaType: 'image/png', offset: 0 },
    { bytes: [0xff, 0xd8, 0xff], mediaType: 'image/jpeg', offset: 0 },
    { bytes: asciiBytes('GIF87a'), mediaType: 'image/gif', offset: 0 },
    { bytes: asciiBytes('GIF89a'), mediaType: 'image/gif', offset: 0 },
    { bytes: asciiBytes('%PDF-'), mediaType: 'application/pdf', offset: 0 },
];

const EXTENSION_MEDIA_TYPES: Readonly<Record<string, string>> = {
    '.csv': 'text/csv',
    '.gif': 'image/gif',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
};

// SVG is text; TextDecoder drops a BOM. Skip a declaration, comments, doctype, then expect <svg.
const SVG_PREFIX = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i;
const SVG_SNIFF_BYTES = 1024;

function looksLikeSvg(data: Uint8Array): boolean {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(
        data.subarray(0, SVG_SNIFF_BYTES)
    );
    return SVG_PREFIX.test(head);
}

function startsWithAscii(data: Uint8Array, offset: number, text: string): boolean {
    return asciiBytes(text).every((byte, index) => data[offset + index] === byte);
}

function asciiBytes(text: string): number[] {
    return Array.from(text, (char) => char.charCodeAt(0));
}
