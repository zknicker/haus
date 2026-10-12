import type { ArtifactMetadata } from '@haus/api';

export function formatArtifactBytes(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 ** 2) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function isPreviewImage(type: string) {
    return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(type);
}
export function fileKind(type: string) {
    if (type.startsWith('image/')) {
        return 'Image';
    }
    if (type.startsWith('video/')) {
        return 'Video';
    }
    if (type.startsWith('audio/')) {
        return 'Audio';
    }
    if (type === 'application/pdf') {
        return 'PDF';
    }
    if (
        type.startsWith('text/') ||
        type.includes('officedocument') ||
        type === 'application/json'
    ) {
        return 'Document';
    }
    return 'File';
}
export function hasLibraryPreview(artifact: ArtifactMetadata) {
    return isPreviewImage(artifact.content_type) && artifact.size_bytes <= 512 * 1024;
}
export function artifactPath(slug: string, id: string) {
    return `/s/${slug}/artifacts/${encodeURIComponent(id)}`;
}
