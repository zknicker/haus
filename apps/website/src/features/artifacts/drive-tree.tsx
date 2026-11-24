import { artifactPathKey } from '@haus/api';
import { FileTree } from '@heroui-pro/react';
import { SearchField } from '@heroui/react';
import * as React from 'react';
import { Collection } from 'react-aria-components';
import {
    useDriveTreeListings,
    useDriveTreeSearch,
} from '../../hooks/artifacts/use-drive-tree-listings.ts';
import { cn } from '../../lib/utils.ts';
import { artifactFolderTone } from './drive-folders.ts';
import {
    type DriveTreeNode,
    driveTreeFileId,
    driveTreeIndex,
    driveTreeMatches,
    driveTreeNodes,
} from './drive-tree-model.ts';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { useDriveTreeExpansion } from './use-drive-tree-expansion.ts';

export function DriveTree({
    artifactId,
    className,
    label,
    onOpenFile,
    path,
    root,
    serverId,
}: {
    artifactId: string;
    className?: string;
    label: string;
    onOpenFile: (artifactId: string) => void;
    path: string;
    root: string;
    serverId: string;
}) {
    const [query, setQuery] = React.useState('');
    const expansion = useDriveTreeExpansion(root, path);
    const listings = useDriveTreeListings(serverId, [root, ...expansion.folders.values()]);
    const search = useDriveTreeSearch(serverId, root, query);
    const matches = search.artifacts ? driveTreeMatches(root, search.artifacts) : null;
    const nodes = matches?.nodes ?? driveTreeNodes(root, listings.listings);
    const index = driveTreeIndex(nodes);
    const expandedKeys = new Set(matches ? matches.expandedIds : expansion.folders.keys());
    const ready = matches !== null || listings.listings.has(artifactPathKey(root));
    const error = search.error ?? listings.error;
    const isPressRef = React.useRef(false);

    return (
        <aside aria-label="Files" className={cn('border-separator flex-col border-e', className)}>
            <h2 className="truncate px-4 pt-4 pb-2 text-sm font-medium">{label}</h2>
            <SearchField
                aria-label="Filter names and paths"
                className="px-3 pb-2"
                onChange={setQuery}
                value={query}
                variant="secondary"
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
                        if (node?.kind === 'file' && node.artifactId !== artifactId) {
                            onOpenFile(node.artifactId);
                        } else if (node?.kind === 'folder' && isPressRef.current && !matches) {
                            expansion.toggle(node.path);
                        }
                    }}
                    renderEmptyState={() =>
                        ready ? (matches ? 'No matching files' : 'No files') : null
                    }
                    selectedKeys={new Set([driveTreeFileId(artifactId)])}
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
