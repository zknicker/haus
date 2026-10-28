import { extensionMediaType, sniffMediaType } from '@haus/api';
import type { AvatarMediaType } from '@haus/api/avatar';
import {
    avatarMaxBytes,
    avatarPixelSize,
    avatarTooLargeMessage,
    avatarUnsupportedMediaTypeMessage,
    isAvatarMediaType,
} from '@haus/api/avatar';

/**
 * One chosen file, center-cropped to a square and re-encoded at the avatar
 * size. `blob` uploads as bytes, `base64` rides a tRPC input, and `dataUrl`
 * is what the local App stores and previews.
 */
export interface AvatarImage {
    base64: string;
    blob: Blob;
    dataUrl: string;
    mediaType: AvatarMediaType;
}

export async function readAvatarImage(file: File): Promise<AvatarImage> {
    const mediaType = await resolveAvatarMediaType(file);
    const source = await loadImage(file);
    const edge = Math.min(source.naturalWidth, source.naturalHeight);

    if (edge === 0) {
        throw new Error('That image could not be read.');
    }

    const target = Math.min(avatarPixelSize, edge);
    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('That image could not be processed.');
    }

    context.drawImage(
        source,
        (source.naturalWidth - edge) / 2,
        (source.naturalHeight - edge) / 2,
        edge,
        edge,
        0,
        0,
        target,
        target
    );

    const blob = await encodeCanvas(canvas, mediaType);
    assertAvatarFits(blob.size);

    const dataUrl = await readDataUrl(blob);

    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), blob, dataUrl, mediaType };
}

export async function resolveAvatarMediaType(file: File): Promise<AvatarMediaType> {
    if (isAvatarMediaType(file.type)) {
        return file.type;
    }

    if (file.type.length > 0 && file.type !== 'application/octet-stream') {
        throw new Error(avatarUnsupportedMediaTypeMessage());
    }

    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const sniffed = sniffMediaType(head);
    if (sniffed && isAvatarMediaType(sniffed)) {
        return sniffed;
    }

    const byName = extensionMediaType(file.name);
    if (byName && isAvatarMediaType(byName)) {
        return byName;
    }

    throw new Error(avatarUnsupportedMediaTypeMessage());
}

export function assertAvatarFits(byteLength: number): void {
    if (byteLength <= 0) {
        throw new Error('That image could not be processed.');
    }
    if (byteLength > avatarMaxBytes) {
        throw new Error(`${avatarTooLargeMessage()} Choose a simpler photo.`);
    }
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('That image could not be read.'));
        };
        image.src = url;
    });
}

function encodeCanvas(canvas: HTMLCanvasElement, mediaType: AvatarMediaType): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('That image could not be processed.'));
                }
            },
            mediaType,
            mediaType === 'image/png' ? undefined : 0.92
        );
    });
}

function readDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('That image could not be read.'));
            }
        };
        reader.onerror = () => reject(new Error('That image could not be read.'));
        reader.readAsDataURL(blob);
    });
}
