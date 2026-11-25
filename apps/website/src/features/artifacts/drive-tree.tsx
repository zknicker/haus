import { artifactPathKey } from '@haus/api';
import { FileTree } from '@heroui-pro/react';
import { SearchField } from '@heroui/react';
import { ExpandParagraphIcon, ListCollapseIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Collection } from 'react-aria-components';
import {
    useDriveTreeListings,
    useDriveTreeSearch,
} from '../../hooks/artifacts/use-drive-tree-listings.ts';
import { cn } from '../../lib/utils.ts';
import { PathIconButton } from './artifact-path-actions.tsx';
import { artifactFolderTone } from './drive-folders.ts';
import {
    type DriveTreeNode,
    driveTreeFileId,
    driveTreeFolderId,
    driveTreeIndex,
    driveTreeMatches,
    driveTreeNodes,
} from './drive-tree-model.ts';
import { driveAreaFilesLabel } from './drive-workspace-trail.ts';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { useDriveTreeExpansion } from './use-drive-tree-expansion.ts';

export type DriveTreeOpen =
    | { artifactId: string; kind: 'file'; path: string }
    | { kind: 'folder'; path: string };

export function DriveTree({
    actions,
    className,
    label,
    onOpenFile,
    onOpenFolder,
    open,
    root,
    serverId,
}: {
    actions?: React.ReactNode;
    className?: string;
    label: string;
    onOpenFile: (file: { artifactId: string; path: string }) => void;
    onOpenFolder: (path: string) => void;
    open: DriveTreeOpen;
    root: string;
    serverId: string;
}) {
    const [query, setQuery] = React.useState('');
    const expansion = useDriveTreeExpansion(root, { kind: open.kind, path: open.path });
    const listings = useDriveTreeListings(serverId, [root, ...expansion.folders.values()]);
    const search = useDriveTreeSearch(serverId, root, query);
    const matches = search.artifacts ? driveTreeMatches(root, search.artifacts) : null;
    const nodes = matches?.nodes ?? driveTreeNodes(root, listings.listings);
    const index = driveTreeIndex(nodes);
    const expandedKeys = new Set(matches ? matches.expandedIds : expansion.folders.keys());
    const ready = matches !== null || listings.listings.has(artifactPathKey(root));
    const error = search.error ?? listings.error;
    const isPressRef = React.useRef(false);
    const folders = [...index.values()].filter((node) => node.kind === 'folder');
    const unopened = folders.filter((node) => !expansion.folders.has(node.id));
    const cascade = expansion.cascading && !matches && unopened.length > 0;
    React.useEffect(() => {
        if (cascade) {
            expansion.expandAll(unopened);
        }
    });
    const openKey =
        open.kind === 'file' ? driveTreeFileId(open.artifactId) : driveTreeFolderId(open.path);
    const anyOpen = expansion.folders.size > 0;

    return (
        <aside aria-label="Files" className={cn('drive-tree flex-col', className)}>
            <div className="drive-tree__header">
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                    {driveAreaFilesLabel}
                </h2>
                {actions}
                {folders.length > 0 ? (
                    <PathIconButton
                        icon={anyOpen ? ListCollapseIcon : ExpandParagraphIcon}
                        isDisabled={matches !== null}
                        label={anyOpen ? 'Collapse all' : 'Expand all'}
                        onPress={() =>
                            anyOpen ? expansion.collapseAll() : expansion.expandAll(folders)
                        }
                    />
                ) : null}
            </div>
            <SearchField
                aria-label="Filter names and paths"
                className="drive-tree__search"
                onChange={setQuery}
                value={query}
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Filter names and paths" />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
            {error ? (
                <p className="text-danger px-4 text-sm" role="alert">
                    {error.message}
                </p>
            ) : null}
            <div
                className="flex min-h-0 flex-1 overflow-hidden px-1 pb-2"
                onClickCapture={() => {
                    isPressRef.current = true;
                }}
                onKeyDownCapture={(event) => {
                    isPressRef.current = pressKeys.has(event.key);
                }}
                onPointerDownCapture={() => {
                    isPressRef.current = true;
                }}
            >
                <FileTree
                    aria-label={`Files in ${label}`}
                    className="h-full min-h-0 w-full flex-1"
                    expandedKeys={expandedKeys}
                    items={nodes}
                    onExpandedChange={(keys) =>
                        matches
                            ? undefined
                            : expansion.setOpen([...keys].map(String), (id) => {
                                  const node = index.get(id);
                                  return node?.kind === 'folder' ? node.path : undefined;
                              })
                    }
                    onSelectionChange={(keys) => {
                        const id = keys === 'all' ? undefined : [...keys].map(String).at(0);
                        const node = id ? index.get(id) : undefined;
                        if (node?.kind === 'file' && node.id !== openKey) {
                            onOpenFile({ artifactId: node.artifactId, path: node.path });
                        } else if (node?.kind === 'folder' && isPressRef.current) {
                            expansion.open(node.path);
                            onOpenFolder(node.path);
                        }
                    }}
                    renderEmptyState={() => (ready && matches ? 'No matching files' : null)}
                    selectedKeys={new Set([openKey])}
                    selectionBehavior="replace"
                    selectionMode="single"
                >
                    {renderNode}
                </FileTree>
            </div>
        </aside>
    );
}

const pressKeys = new Set(['Enter', ' ']);

function renderNode(node: DriveTreeNode) {
    if (node.kind === 'file') {
        return (
            <FileTree.Item
                icon={<ArtifactFileIcon kind={node.fileKind} size={16} />}
                id={node.id}
                textValue={node.name}
                title={node.name}
            />
        );
    }
    return (
        <FileTree.Item
            hasChildItems
            icon={<ArtifactFolderIcon size={16} tone={artifactFolderTone(node.path)} />}
            id={node.id}
            textValue={node.name}
            title={node.name}
        >
            {node.children.length > 0 ? (
                <Collection items={node.children}>{renderNode}</Collection>
            ) : null}
        </FileTree.Item>
    );
}
