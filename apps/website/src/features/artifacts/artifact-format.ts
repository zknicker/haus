import type { ArtifactMetadata } from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';
import { serverRoute } from '../servers/server-routes.ts';
import type { ArtifactFileKind } from './icons/artifact-file-kind.ts';

export function artifactPath(slug: string, artifactId: string, revisionId?: string) {
    const path = `${serverRoute(slug)}/artifacts/${encodeURIComponent(artifactId)}`;
    return revisionId ? `${path}?revision=${encodeURIComponent(revisionId)}` : path;
}

export function formatArtifactBytes(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 ** 2) {
        return `${trimmed(bytes / 1024)} KB`;
    }
    if (bytes < 1024 ** 3) {
        return `${trimmed(bytes / 1024 ** 2)} MB`;
    }
    return `${trimmed(bytes / 1024 ** 3)} GB`;
}

const kindLabels: Record<ArtifactFileKind, string> = {
    archive: 'Archive',
    audio: 'Audio',
    code: 'Code',
    document: 'Document',
    html: 'HTML',
    image: 'Image',
    other: 'File',
    pdf: 'PDF',
    slides: 'Slides',
    spreadsheet: 'Spreadsheet',
    text: 'Text',
    video: 'Video',
};

export function artifactKindLabel(kind: ArtifactFileKind) {
    return kindLabels[kind];
}

/** Passive raster formats only: SVG and HTML can carry script and never render inline. */
export function isPreviewImage(contentType: string) {
    return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(
        contentType
    );
}

/** Raster files show their Server-rendered thumbnail in the library, whatever their size. */
export function hasLibraryPreview(artifact: Pick<ArtifactMetadata, 'content_type'>) {
    return isPreviewImage(artifact.content_type);
}

/** "just now", "12m ago", "3h ago" within a day; a short date after that. */
export function artifactTimeLabel(value: string, now: number) {
    const date = new Date(value);
    if (now - date.getTime() < 24 * 60 * 60_000) {
        return formatRelativeTime(value, now);
    }
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

/** A full timestamp for detail rows: "Oct 9, 2026, 3:14 PM". */
export function formatArtifactDate(value: string) {
    return new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function trimmed(value: number) {
    return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}
