import {
    attachmentMediaTypeSniffBytes,
    extensionMediaType,
    inferAttachmentMediaType,
    isGenericMediaType,
    normalizeMediaType,
} from '@haus/api';

/**
 * A file staged in the composer. `mediaType` is what the App renders it as
 * until the Server resolves the stored type: the browser's type, else the
 * extension, else empty until `sniffComposerAttachmentType` reads the bytes.
 * Previews are decoded through the attachment image cache, keyed by `nonce`.
 */
export interface ComposerAttachment {
    file: File;
    mediaType: string;
    nonce: string;
}

export function createComposerAttachment(file: File): ComposerAttachment {
    return {
        file,
        mediaType: isGenericMediaType(file.type)
            ? (extensionMediaType(file.name) ?? '')
            : normalizeMediaType(file.type),
        nonce: crypto.randomUUID(),
    };
}

/** Whether the browser left this file's type for the bytes to decide (pasted or unknown files). */
export function needsComposerAttachmentSniff(attachment: ComposerAttachment) {
    return isGenericMediaType(attachment.file.type);
}

export async function sniffComposerAttachmentType(file: File): Promise<string> {
    const head = new Uint8Array(await file.slice(0, attachmentMediaTypeSniffBytes).arrayBuffer());
    return inferAttachmentMediaType(file.name, head);
}
