/** A download-as-file header for any filename: an ASCII fallback plus the exact UTF-8 name. */
export function attachmentDisposition(filename: string) {
    const fallback = filename
        .normalize('NFKD')
        .replace(/[^\x20-\x7e]/gu, '_')
        .replace(/["\\]/gu, '_');
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
