/** What a file is, as the Artifacts library draws it: one icon and one tint per kind. */
export type ArtifactFileKind =
    | 'image'
    | 'video'
    | 'audio'
    | 'pdf'
    | 'document'
    | 'spreadsheet'
    | 'slides'
    | 'code'
    | 'html'
    | 'text'
    | 'archive'
    | 'other';

/**
 * Classify a file by its MIME type first, then by its extension when the type
 * is missing or generic (`application/octet-stream`, `text/plain` for source).
 */
export function artifactFileKind({
    content_type,
    filename,
}: {
    content_type: string;
    filename: string;
}): ArtifactFileKind {
    const fromMime = kindFromMime(content_type.split(';')[0]?.trim().toLowerCase() ?? '');
    if (fromMime && fromMime !== 'text') {
        return fromMime;
    }
    // `text/plain` is what many uploaders stamp on source files and CSVs, so
    // a specific extension outranks it.
    return kindFromExtension(filename) ?? fromMime ?? 'other';
}

const exactMimeKinds: Record<string, ArtifactFileKind> = {
    'application/pdf': 'pdf',
    'text/html': 'html',
    'application/xhtml+xml': 'html',
    'text/csv': 'spreadsheet',
    'text/tab-separated-values': 'spreadsheet',
    'application/vnd.ms-excel': 'spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
    'application/vnd.oasis.opendocument.spreadsheet': 'spreadsheet',
    'application/vnd.apple.numbers': 'spreadsheet',
    'application/vnd.ms-powerpoint': 'slides',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
    'application/vnd.oasis.opendocument.presentation': 'slides',
    'application/vnd.apple.keynote': 'slides',
    'application/msword': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'application/vnd.oasis.opendocument.text': 'document',
    'application/vnd.apple.pages': 'document',
    'application/rtf': 'document',
    'text/rtf': 'document',
    'text/markdown': 'document',
    'application/json': 'code',
    'application/javascript': 'code',
    'text/javascript': 'code',
    'application/typescript': 'code',
    'application/xml': 'code',
    'text/xml': 'code',
    'text/css': 'code',
    'application/x-sh': 'code',
    'application/yaml': 'code',
    'application/zip': 'archive',
    'application/gzip': 'archive',
    'application/x-tar': 'archive',
    'application/x-7z-compressed': 'archive',
    'application/x-rar-compressed': 'archive',
    'application/vnd.rar': 'archive',
    'application/x-bzip2': 'archive',
    'text/plain': 'text',
};

function kindFromMime(mime: string): ArtifactFileKind | null {
    const exact = exactMimeKinds[mime];
    if (exact) {
        return exact;
    }
    if (mime.startsWith('image/')) {
        return 'image';
    }
    if (mime.startsWith('video/')) {
        return 'video';
    }
    if (mime.startsWith('audio/')) {
        return 'audio';
    }
    if (mime.startsWith('text/')) {
        return 'text';
    }
    return null;
}

const extensionKinds: Record<string, ArtifactFileKind> = {
    ...groupKinds('image', 'png jpg jpeg gif webp avif heic heif bmp tif tiff svg ico'),
    ...groupKinds('video', 'mp4 mov m4v webm mkv avi'),
    ...groupKinds('audio', 'mp3 m4a wav aac flac ogg oga opus aiff'),
    ...groupKinds('pdf', 'pdf'),
    ...groupKinds('document', 'doc docx odt rtf pages md mdx markdown'),
    ...groupKinds('spreadsheet', 'csv tsv xls xlsx ods numbers'),
    ...groupKinds('slides', 'ppt pptx odp key'),
    ...groupKinds(
        'code',
        'js mjs cjs jsx ts tsx json jsonl py rb go rs java kt swift c h cc cpp cs php sh zsh bash sql css scss yaml yml toml xml'
    ),
    ...groupKinds('html', 'html htm xhtml'),
    ...groupKinds('text', 'txt log text'),
    ...groupKinds('archive', 'zip gz tgz tar 7z rar bz2 xz'),
};

function kindFromExtension(filename: string): ArtifactFileKind | null {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0 || dot === filename.length - 1) {
        return null;
    }
    return extensionKinds[filename.slice(dot + 1).toLowerCase()] ?? null;
}

function groupKinds(kind: ArtifactFileKind, extensions: string) {
    return Object.fromEntries(extensions.split(' ').map((extension) => [extension, kind]));
}
