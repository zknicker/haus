/**
 * Attachment media types, resolved the same way by the App composer, the Server, and the Agent
 * CLI. Content wins over the name, because a generated or pasted file's extension is often wrong
 * or missing; the extension covers formats with no signature. Apps render a mislabeled image as a
 * file card, so resolving well here is what makes an image show inline.
 */

/** Enough leading bytes for every signature below, including SVG's text prologue. */
export const attachmentMediaTypeSniffBytes = 1024;

const fallbackMediaType = 'application/octet-stream';
const genericMediaTypes = new Set(['', 'application/octet-stream', 'binary/octet-stream']);
// A ZIP signature says "container", not what is inside: a .docx or .xlsx is a ZIP too.
const containerMediaTypes = new Set(['application/zip']);

/**
 * The type to store for an attachment. A missing or generic declared type takes the content
 * signature, then the extension. A declared image type the bytes contradict takes the bytes, so
 * a PNG labeled `image/jpeg` (or a PDF labeled `image/png`) is stored as what it is. Any other
 * declared type is kept.
 */
export function resolveAttachmentMediaType({
    declared,
    filename,
    head,
}: {
    declared: string | null | undefined;
    filename: string;
    head: Uint8Array;
}): string {
    const declaredType = normalizeMediaType(declared);
    const sniffed = sniffMediaType(head);
    const byName = extensionMediaType(filename);

    if (genericMediaTypes.has(declaredType)) {
        if (sniffed && !(containerMediaTypes.has(sniffed) && byName)) {
            return sniffed;
        }
        return byName ?? sniffed ?? fallbackMediaType;
    }
    if (
        declaredType.startsWith('image/') &&
        sniffed &&
        sniffed !== declaredType &&
        !containerMediaTypes.has(sniffed)
    ) {
        return sniffed;
    }
    return declaredType;
}

/** The type of a file whose sender declared none: content, then extension, then octet-stream. */
export function inferAttachmentMediaType(filename: string, head: Uint8Array): string {
    return resolveAttachmentMediaType({ declared: null, filename, head });
}

export function isGenericMediaType(mediaType: string | null | undefined) {
    return genericMediaTypes.has(normalizeMediaType(mediaType));
}

export function sniffMediaType(data: Uint8Array): string | null {
    for (const signature of signatures) {
        if (matches(data, signature.offset, signature.bytes)) {
            return signature.mediaType;
        }
    }
    return sniffContainer(data) ?? (looksLikeSvg(data) ? 'image/svg+xml' : null);
}

export function extensionMediaType(filename: string): string | null {
    const name = filename.slice(
        Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1
    );
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) {
        return null;
    }
    return extensionMediaTypes[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function normalizeMediaType(mediaType: string | null | undefined) {
    return (mediaType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

interface Signature {
    bytes: readonly number[];
    mediaType: string;
    offset: number;
}

const signatures: readonly Signature[] = [
    sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'),
    sig([0xff, 0xd8, 0xff], 'image/jpeg'),
    sig(ascii('GIF87a'), 'image/gif'),
    sig(ascii('GIF89a'), 'image/gif'),
    sig([0x49, 0x49, 0x2a, 0x00], 'image/tiff'),
    sig([0x4d, 0x4d, 0x00, 0x2a], 'image/tiff'),
    sig(ascii('%PDF-'), 'application/pdf'),
    sig([0x50, 0x4b, 0x03, 0x04], 'application/zip'),
    sig([0x1f, 0x8b], 'application/gzip'),
    sig([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], 'application/x-7z-compressed'),
    sig([...ascii('Rar!'), 0x1a, 0x07], 'application/vnd.rar'),
    sig(ascii('ID3'), 'audio/mpeg'),
    sig([0xff, 0xfb], 'audio/mpeg'),
    sig([0xff, 0xf3], 'audio/mpeg'),
    sig([0xff, 0xf2], 'audio/mpeg'),
    sig([0xff, 0xf1], 'audio/aac'),
    sig([0xff, 0xf9], 'audio/aac'),
    sig(ascii('OggS'), 'audio/ogg'),
    sig(ascii('fLaC'), 'audio/flac'),
];

/** ISO media brands (`ftyp` at offset 4) and RIFF/EBML forms, which need more than a prefix. */
function sniffContainer(data: Uint8Array): string | null {
    if (matches(data, 4, ascii('ftyp'))) {
        return ftypBrands[String.fromCharCode(...data.subarray(8, 12))] ?? null;
    }
    if (matches(data, 0, ascii('RIFF'))) {
        return riffForms[String.fromCharCode(...data.subarray(8, 12))] ?? null;
    }
    if (matches(data, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
        const header = String.fromCharCode(...data.subarray(0, 64));
        return header.includes('webm') ? 'video/webm' : 'video/x-matroska';
    }
    // BMP and ICO open with two or four common bytes, so their reserved fields must agree too.
    if (matches(data, 0, ascii('BM')) && data.length >= 14 && matches(data, 6, [0, 0, 0, 0])) {
        return 'image/bmp';
    }
    if (matches(data, 0, [0x00, 0x00, 0x01, 0x00]) && (data[4] ?? 0) + (data[5] ?? 0) > 0) {
        return 'image/x-icon';
    }
    return null;
}

const ftypBrands: Readonly<Record<string, string>> = {
    avif: 'image/avif',
    avis: 'image/avif',
    heic: 'image/heic',
    heix: 'image/heic',
    hevc: 'image/heic',
    hevx: 'image/heic',
    heim: 'image/heic',
    heis: 'image/heic',
    mif1: 'image/heif',
    msf1: 'image/heif',
    'M4A ': 'audio/mp4',
    'M4B ': 'audio/mp4',
    'qt  ': 'video/quicktime',
    'M4V ': 'video/mp4',
    isom: 'video/mp4',
    iso2: 'video/mp4',
    mp41: 'video/mp4',
    mp42: 'video/mp4',
    avc1: 'video/mp4',
    dash: 'video/mp4',
    '3gp4': 'video/3gpp',
    '3gp5': 'video/3gpp',
};

const riffForms: Readonly<Record<string, string>> = {
    WEBP: 'image/webp',
    WAVE: 'audio/wav',
    'AVI ': 'video/x-msvideo',
};

const extensionMediaTypes: Readonly<Record<string, string>> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    key: 'application/vnd.apple.keynote',
    numbers: 'application/vnd.apple.numbers',
    pages: 'application/vnd.apple.pages',
    rtf: 'application/rtf',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    log: 'text/plain',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    zip: 'application/zip',
    gz: 'application/gzip',
    tgz: 'application/gzip',
    tar: 'application/x-tar',
    '7z': 'application/x-7z-compressed',
    rar: 'application/vnd.rar',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/opus',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
};

// SVG is text; TextDecoder drops a BOM. Skip a declaration, comments, doctype, then expect <svg.
const svgPrefix = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/iu;

function looksLikeSvg(data: Uint8Array): boolean {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(
        data.subarray(0, attachmentMediaTypeSniffBytes)
    );
    return svgPrefix.test(head);
}

function matches(data: Uint8Array, offset: number, bytes: readonly number[]) {
    return (
        data.length >= offset + bytes.length && bytes.every((byte, i) => data[offset + i] === byte)
    );
}

function sig(bytes: readonly number[], mediaType: string, offset = 0): Signature {
    return { bytes, mediaType, offset };
}

function ascii(text: string): number[] {
    return Array.from(text, (char) => char.charCodeAt(0));
}
