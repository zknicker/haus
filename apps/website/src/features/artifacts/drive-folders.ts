import {
    type ArtifactFolderEntry,
    type ArtifactMetadata,
    artifactPathAncestors,
    artifactPathBasename,
    artifactPathIsInside,
    artifactPathKey,
    artifactPathParent,
} from '@haus/api';
import { type ArtifactFolderTone, artifactFolderTones } from './icons/artifact-folder-icon.tsx';

/** One folder in a drive trail: its name and full path. */
export interface ArtifactFolderCrumb {
    label: string;
    path: string;
}

/** `starter-kit/scripts` → `starter-kit`, then `starter-kit/scripts`; the root has none. */
export function artifactFolderCrumbs(folder: string): ArtifactFolderCrumb[] {
    if (folder === '') {
        return [];
    }
    return [...artifactPathAncestors(folder), folder].map((path) => ({
        label: artifactPathBasename(path),
        path,
    }));
}

const tintedTones = artifactFolderTones.filter((tone) => tone !== 'neutral');

/**
 * A folder's tint, from a hash of its folded path alone, so it never changes
 * when a sibling appears or leaves and the same folder reads the same color
 * everywhere. Siblings may share a tint. Neutral stays unused: every folder
 * is a real place.
 */
export function artifactFolderTone(path: string): ArtifactFolderTone {
    // FNV-1a: tiny, stable across sessions, and well spread for short keys.
    let hash = 0x81_1c_9d_c5;
    for (const char of artifactPathKey(path)) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01_00_01_93);
    }
    return tintedTones[(hash >>> 0) % tintedTones.length] ?? 'blue';
}

/**
 * Up to `limit` of each child folder's newest files, from one recursive read
 * of the current folder (newest first). A folder whose files all fall past
 * that read peeks nothing; its tile still shows its count.
 */
export function artifactFolderPreviews(
    folders: readonly Pick<ArtifactFolderEntry, 'path'>[],
    artifacts: readonly ArtifactMetadata[],
    limit = 3
): Map<string, ArtifactMetadata[]> {
    const previews = new Map(folders.map((folder) => [folder.path, [] as ArtifactMetadata[]]));
    for (const artifact of artifacts) {
        const folder = folders.find((entry) => artifactPathIsInside(artifact.path, entry.path));
        const bucket = folder ? previews.get(folder.path) : undefined;
        if (bucket && bucket.length < limit) {
            bucket.push(artifact);
        }
    }
    return previews;
}

/**
 * Where Move to… lands `path` (a file or folder) inside `folder`, keeping its
 * name; null when that is no move (it is already there) or impossible (a
 * folder into itself or one of its own subfolders).
 */
export function artifactMoveTarget(path: string, folder: string): string | null {
    if (artifactPathKey(artifactPathParent(path)) === artifactPathKey(folder)) {
        return null;
    }
    if (
        folder !== '' &&
        (artifactPathKey(folder) === artifactPathKey(path) || artifactPathIsInside(folder, path))
    ) {
        return null;
    }
    const name = artifactPathBasename(path);
    return folder ? `${folder}/${name}` : name;
}

/** Where a search hit lives, relative to the folder being searched; `''` when directly in it. */
export function artifactFolderWithin(path: string, folder: string): string {
    const parent = artifactPathParent(path);
    if (folder === '' || artifactPathKey(parent) === artifactPathKey(folder)) {
        return folder === '' ? parent : '';
    }
    return artifactPathIsInside(parent, folder) ? parent.slice(folder.length + 1) : parent;
}

/**
 * A long name shortened in the middle, Finder's way, so the tail that tells
 * print folders apart (`…design-02`) survives: `KEY-100-ca…design-02`. Two tile lines hold about 20.
 */
export function middleTruncatedName(name: string, max = 20): string {
    const characters = [...name];
    if (characters.length <= max) {
        return name;
    }
    const head = Math.ceil((max - 1) / 2);
    const tail = max - 1 - head;
    return `${characters.slice(0, head).join('')}…${characters.slice(-tail).join('')}`;
}
