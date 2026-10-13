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

/**
 * Tints dealt in path-key order, so a set of sibling folders keeps its colors
 * across reads and no two share a tint until there are more folders than
 * tints. Neutral stays unused: every folder is a real place.
 */
export function artifactFolderToneMap(paths: readonly string[]): Map<string, ArtifactFolderTone> {
    const tinted = artifactFolderTones.filter((tone) => tone !== 'neutral');
    const keys = [...new Set(paths.map(artifactPathKey))].sort();
    const toneByKey = new Map(keys.map((key, index) => [key, tinted[index % tinted.length]]));
    return new Map(
        paths.map((path) => [path, toneByKey.get(artifactPathKey(path)) ?? 'blue'] as const)
    );
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

/** Where a search hit lives, relative to the folder being searched; `''` when directly in it. */
export function artifactFolderWithin(path: string, folder: string): string {
    const parent = artifactPathParent(path);
    if (folder === '' || artifactPathKey(parent) === artifactPathKey(folder)) {
        return folder === '' ? parent : '';
    }
    return artifactPathIsInside(parent, folder) ? parent.slice(folder.length + 1) : parent;
}
