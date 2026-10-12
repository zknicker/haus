/**
 * The files a paste should attach, or none when it is a text paste. A
 * screenshot, a browser "Copy Image", and files copied in Finder all carry
 * files. Rich text copied from Word or a web page can carry a rendered image
 * of the selection beside its text and HTML; that paste is text.
 */
export function pastedFiles(clipboard: Pick<DataTransfer, 'files' | 'getData' | 'types'> | null) {
    if (!clipboard || clipboard.files.length === 0) {
        return [];
    }
    const types = Array.from(clipboard.types);
    const isRichText =
        types.includes('text/html') &&
        types.includes('text/plain') &&
        clipboard.getData('text/plain').trim().length > 0;
    return isRichText ? [] : Array.from(clipboard.files);
}
