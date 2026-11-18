import type { AttachmentMetadata } from '@haus/api';
import { formatChatAttachmentSize } from '@heroui-pro/react';
import type { AttachmentImageSource } from '../../../hooks/servers/use-attachment-image.ts';
import {
    type ArtifactFileKind,
    artifactFileKind,
} from '../../artifacts/icons/artifact-file-kind.ts';

/**
 * One attachment as every chat surface draws it: a durable Server attachment
 * or a staged file riding a pending send. Both resolve to the same tile, so a
 * send never changes shape when the Server confirms it.
 */
export interface MessageAttachmentItem {
    filename: string;
    id: string;
    kind: ArtifactFileKind;
    mediaType: string;
    sizeBytes: number;
    source: AttachmentImageSource;
}

export function hostedAttachmentItems(
    attachments: readonly AttachmentMetadata[],
    serverId: string
): MessageAttachmentItem[] {
    return attachments.map((attachment) => ({
        ...attachmentFacts(attachment),
        source: { attachmentId: attachment.id, kind: 'hosted', serverId },
    }));
}

export function localAttachmentItems(
    attachments: readonly (AttachmentMetadata & { file: File })[]
): MessageAttachmentItem[] {
    return attachments.map((attachment) => ({
        ...attachmentFacts(attachment),
        source: { file: attachment.file, kind: 'local', nonce: attachment.id },
    }));
}

/** "PDF · 2.4 MB": the format a reader scans for, then the size. */
export function describeAttachment(
    attachment: Pick<MessageAttachmentItem, 'filename' | 'mediaType' | 'sizeBytes'>
) {
    const label = attachmentFormatLabel(attachment.filename, attachment.mediaType);
    const size = formatChatAttachmentSize(attachment.sizeBytes);
    return label ? `${label} · ${size}` : size;
}

export function attachmentFormatLabel(filename: string, mediaType: string) {
    const extension = filename.match(extensionPattern)?.[1];
    if (extension) {
        return extension.toUpperCase();
    }
    const subtype = mediaType.split(';')[0]?.split('/')[1]?.trim() ?? '';
    return readableSubtypePattern.test(subtype) ? subtype.toUpperCase() : null;
}

function attachmentFacts(attachment: AttachmentMetadata) {
    return {
        filename: attachment.filename,
        id: attachment.id,
        // A legacy row stored as octet-stream still previews when its name says image.
        kind: artifactFileKind({
            content_type: attachment.mediaType,
            filename: attachment.filename,
        }),
        mediaType: attachment.mediaType,
        sizeBytes: attachment.sizeBytes,
    };
}

const extensionPattern = /\.([a-z0-9]{1,5})$/iu;
// `png`, `pdf`, `mp4` read as a format; `octet-stream` or `vnd.…` do not.
const readableSubtypePattern = /^[a-z0-9]{2,5}$/u;
