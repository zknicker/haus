import type { ArtifactRecord } from '@haus/api';
import { artifactPathIsInside, artifactPathKey, artifactPathParent } from '@haus/api';
import { formatArtifactBytes } from './artifact-format.ts';
import type { LibraryItem } from './library-items.ts';

/**
 * What a bulk action does with a selection, decided before anything runs: which files a delete
 * may remove, what a zip holds, where a move lands, and how the selection reads in words.
 */
export interface BulkDeletePlan {
    /** Files this member may delete (their own, or any for a human Owner/Admin). */
    deletable: ArtifactRecord[];
    /** Selected items the delete leaves: other people's files and every folder. */
    kept: number;
    total: number;
}

export function bulkDeletePlan(
    items: readonly LibraryItem[],
    canDelete: (file: ArtifactRecord) => boolean
): BulkDeletePlan {
    const deletable = items.flatMap((item) =>
        item.kind === 'file' && canDelete(item.file) ? [item.file] : []
    );
    return { deletable, kept: items.length - deletable.length, total: items.length };
}

/** A lone file downloads as itself; anything more, or any folder, downloads as one zip. */
export function bulkDownloadIsZip(items: readonly LibraryItem[]): boolean {
    return items.length > 1 || items.some((item) => item.kind === 'folder');
}

/**
 * The zip request for a selection in the open folder: entries are named relative to that
 * folder, so a search hit deeper down keeps the folders between.
 */
export function bulkZipSelection(items: readonly LibraryItem[], folder: string) {
    return { paths: items.map((item) => item.path), root: folder };
}

/**
 * The selected paths a move into `folder` actually moves (those not already there), or null when
 * the move is impossible or empty: `folder` is one of the selected folders or sits inside one, or
 * everything is already in it. A drop on such a folder is a no-op.
 */
export function bulkMovePaths(paths: readonly string[], folder: string): string[] | null {
    const intoItself = paths.some(
        (path) =>
            folder !== '' &&
            (artifactPathKey(folder) === artifactPathKey(path) ||
                artifactPathIsInside(folder, path))
    );
    if (intoItself) {
        return null;
    }
    const moving = paths.filter(
        (path) => artifactPathKey(artifactPathParent(path)) !== artifactPathKey(folder)
    );
    return moving.length > 0 ? moving : null;
}

/** "4 selected · 120 MB", naming folders apart since their size is not on hand. */
export function selectionSummary(items: readonly LibraryItem[]): string {
    const files = items.flatMap((item) => (item.kind === 'file' ? [item.file] : []));
    const folders = items.length - files.length;
    const parts = [`${items.length} selected`];
    if (files.length > 0) {
        parts.push(formatArtifactBytes(files.reduce((sum, file) => sum + file.size_bytes, 0)));
    }
    if (folders > 0 && files.length > 0) {
        parts.push(folders === 1 ? '1 folder' : `${folders} folders`);
    }
    return parts.join(' · ');
}

/** One link per line: each file's stable link, each folder's library link. */
export function selectionLinks(
    items: readonly LibraryItem[],
    folderLink: (path: string) => string
): string {
    return items
        .map((item) => (item.kind === 'file' ? item.file.stable_url : folderLink(item.path)))
        .join('\n');
}
