/** A download-as-file header for any filename: an ASCII fallback plus the exact UTF-8 name. */
export function attachmentDisposition(filename: string) {
    return contentDisposition('attachment', filename);
}

/** A `Content-Disposition` for any filename: an ASCII fallback plus the exact UTF-8 name. */
export function contentDisposition(type: 'inline' | 'attachment', filename: string) {
    const fallback = filename
        .normalize('NFKD')
        .replace(/[^\x20-\x7e]/gu, '_')
        .replace(/["\\]/gu, '_');
    return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
