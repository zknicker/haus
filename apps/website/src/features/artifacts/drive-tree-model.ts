import { artifactPathKey, artifactPathParent } from '@haus/api';
import { drivePlace } from './drive-places.ts';
import { type ArtifactFileKind, artifactFileKind } from './icons/artifact-file-kind.ts';

export type DriveTreeNode =
    | { children: DriveTreeNode[]; id: string; kind: 'folder'; name: string; path: string }
    | {
          artifactId: string;
          fileKind: ArtifactFileKind;
          id: string;
          kind: 'file';
          name: string;
          path: string;
      };

export type DriveTreeFolderNode = Extract<DriveTreeNode, { kind: 'folder' }>;

export interface DriveTreeFile {
    artifact_id: string;
    content_type: string;
    filename: string;
    path: string;
}

export interface DriveTreeListing {
    artifacts: readonly DriveTreeFile[];
    folders: readonly { name: string; path: string }[];
}

export function driveWorkspaceRoot(folder: string) {
    const place = drivePlace(folder);
    if (place.kind === 'area') {
        return place.area.root;
    }
    if (place.kind === 'legacy') {
        return folder.split('/')[0] ?? '';
    }
    return null;
}

export function driveTreeRoot(path: string) {
    const folder = artifactPathParent(path);
    return driveWorkspaceRoot(folder) ?? folder;
}

export function driveTreeFolderAncestors(root: string, folder: string) {
    return driveTreeAncestors(root, `${folder}/`);
}

export function driveTreeAncestors(root: string, path: string) {
    const parent = artifactPathParent(path);
    const segments = parent === '' ? [] : parent.split('/');
    const rootDepth = root === '' ? 0 : root.split('/').length;
    return segments
        .slice(rootDepth)
        .map((_, index) => segments.slice(0, rootDepth + index + 1).join('/'));
}

export function driveTreeFolderId(path: string) {
    return `folder:${artifactPathKey(path)}`;
}

export function driveTreeFileId(artifactId: string) {
    return `file:${artifactId}`;
}

export const driveTreeNodes: (
    folder: string,
    listings: ReadonlyMap<string, DriveTreeListing>
) => DriveTreeNode[] = (folder, listings) => {
    const listing = listings.get(artifactPathKey(folder));
    if (!listing) {
        return [];
    }
    const folders = [...listing.folders].sort(byName).map((entry) => {
        const node: DriveTreeNode = {
            children: driveTreeNodes(entry.path, listings),
            id: driveTreeFolderId(entry.path),
            kind: 'folder',
            name: entry.name,
            path: entry.path,
        };
        return node;
    });
    const files = listing.artifacts.map(fileNode).sort(byName);
    return [...folders, ...files];
};

export function driveTreeMatches(root: string, artifacts: readonly DriveTreeFile[]) {
    const nodes: DriveTreeNode[] = [];
    const folders = new Map<string, DriveTreeFolderNode>();
    for (const artifact of artifacts) {
        let siblings = nodes;
        for (const path of driveTreeAncestors(root, artifact.path)) {
            const id = driveTreeFolderId(path);
            let folder = folders.get(id);
            if (!folder) {
                folder = { children: [], id, kind: 'folder', name: lastSegment(path), path };
                folders.set(id, folder);
                siblings.push(folder);
            }
            siblings = folder.children;
        }
        siblings.push(fileNode(artifact));
    }
    sortTree(nodes);
    return { expandedIds: [...folders.keys()], nodes };
}

export function driveTreeIndex(
    nodes: readonly DriveTreeNode[],
    index = new Map<string, DriveTreeNode>()
) {
    for (const node of nodes) {
        index.set(node.id, node);
        if (node.kind === 'folder') {
            driveTreeIndex(node.children, index);
        }
    }
    return index;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function byName(a: { name: string }, b: { name: string }) {
    return collator.compare(a.name, b.name);
}

function sortTree(nodes: DriveTreeNode[]) {
    nodes.sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === 'folder' ? -1 : 1));
    for (const node of nodes) {
        if (node.kind === 'folder') {
            sortTree(node.children);
        }
    }
}

function fileNode(artifact: DriveTreeFile) {
    const node: DriveTreeNode = {
        artifactId: artifact.artifact_id,
        fileKind: artifactFileKind(artifact),
        id: driveTreeFileId(artifact.artifact_id),
        kind: 'file',
        name: artifact.filename,
        path: artifact.path,
    };
    return node;
}

function lastSegment(path: string) {
    return path.slice(path.lastIndexOf('/') + 1);
}
