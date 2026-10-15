import type { ArtifactPublicLink, ArtifactRecord } from '@haus/api';
import type { Key, Selection } from 'react-aria-components';

/**
 * One selectable thing in the library, keyed as the collection keys it: a folder by its path,
 * a file by its artifact id.
 */
export type LibraryItem =
    | { key: string; kind: 'folder'; path: string }
    | {
          file: ArtifactRecord;
          key: string;
          kind: 'file';
          path: string;
          publicLink: ArtifactPublicLink | null;
      };

/** The library's items in visual order: folders first, then files as the runs draw them. */
export function libraryItems(
    folders: readonly { path: string }[],
    files: readonly ArtifactRecord[],
    publicLinks: Readonly<Record<string, ArtifactPublicLink>>
): LibraryItem[] {
    return [
        ...folders.map(
            (folder): LibraryItem => ({
                key: folder.path,
                kind: 'folder',
                path: folder.path,
            })
        ),
        ...files.map(
            (file): LibraryItem => ({
                file,
                key: file.artifact_id,
                kind: 'file',
                path: file.path,
                publicLink: publicLinks[file.artifact_id] ?? null,
            })
        ),
    ];
}

/**
 * The selected items still on screen, in visual order. A key whose item left (deleted, moved
 * away by someone else) simply drops out, so a selection survives live updates for everything
 * that remains. `all` (Command-A) is every loaded item.
 */
export function selectedLibraryItems(
    keys: Selection,
    items: readonly LibraryItem[]
): LibraryItem[] {
    if (keys === 'all') {
        return [...items];
    }
    return items.filter((item) => keys.has(item.key));
}

/** Whether `key` is part of the selection (`all` holds every item). */
export function isLibraryKeySelected(keys: Selection, key: Key): boolean {
    return keys === 'all' || keys.has(key);
}
