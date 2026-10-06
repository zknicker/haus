import type { Selection } from '@heroui/react';
import { FileTree } from '@heroui-pro/react';
import { File01Icon, Folder01Icon, FolderOpenIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Collection } from 'react-aria-components';
import { Icon } from '../../components/ui/icon.tsx';
import type { WorkspaceTreeNode } from './chat-artifact-workspace-model.ts';

export function WorkspaceFileTree({
    expandedKeys,
    hasQuery,
    nodes,
    onExpandedChange,
    onSelectFile,
    onToggleDirectory,
    selectedPath,
}: {
    expandedKeys: ReadonlySet<string>;
    hasQuery: boolean;
    nodes: WorkspaceTreeNode[];
    onExpandedChange: (keys: ReadonlySet<string>) => void;
    onSelectFile: (path: string) => void;
    onToggleDirectory: (path: string) => void;
    selectedPath: null | string;
}) {
    const kindsById = React.useMemo(() => indexKinds(nodes), [nodes]);
    const selectedKeys = React.useMemo<Selection>(
        () => new Set(selectedPath ? [selectedPath] : []),
        [selectedPath]
    );
    const disabledKeys = React.useMemo(
        () => [...kindsById].flatMap(([id, kind]) => (kind === 'notice' ? [id] : [])),
        [kindsById]
    );
    // `replace` selection follows keyboard focus, so any focus move onto a
    // folder (arrows, ArrowLeft to the parent, type-ahead) also reports it as
    // selected. Only a press — pointer, Enter, or Space — opens or closes it.
    const isPressRef = React.useRef(false);
    const renderNode = React.useCallback(
        function renderNode(node: WorkspaceTreeNode): React.ReactElement {
            if (node.kind !== 'directory') {
                return (
                    <FileTree.Item
                        icon={node.kind === 'file' ? fileIcon : undefined}
                        id={node.id}
                        textValue={node.name}
                        title={
                            node.kind === 'notice' ? (
                                <span className={noticeToneClass[node.tone]}>{node.name}</span>
                            ) : (
                                node.name
                            )
                        }
                    />
                );
            }
            return (
                <FileTree.Item
                    // An unlisted folder has no children to infer from, and
                    // without the chevron there is nothing to expand — which is
                    // what starts its listing. A query only keeps folders that
                    // hold matches, so there a childless one is a plain row.
                    hasChildItems={!hasQuery || node.children.length > 0}
                    icon={directoryIcon}
                    id={node.id}
                    textValue={node.name}
                    title={node.name}
                >
                    {node.children.length > 0 ? (
                        <Collection items={node.children}>{renderNode}</Collection>
                    ) : null}
                </FileTree.Item>
            );
        },
        [hasQuery]
    );

    return (
        <div
            className="contents"
            onClickCapture={() => {
                isPressRef.current = true;
            }}
            // A screen reader's virtual click fires `click` without `pointerdown`.
            onKeyDownCapture={(event) => {
                isPressRef.current = pressKeys.has(event.key);
            }}
            onPointerDownCapture={() => {
                isPressRef.current = true;
            }}
        >
            <FileTree
                aria-label="Workspace files"
                className="h-full min-h-0 w-full flex-1"
                disabledKeys={disabledKeys}
                expandedKeys={expandedKeys}
                items={nodes}
                onExpandedChange={(keys) => onExpandedChange(new Set([...keys].map(String)))}
                onSelectionChange={(keys) => {
                    if (keys === 'all') {
                        return;
                    }
                    const path = [...keys].map(String).at(0);
                    const kind = path ? kindsById.get(path) : undefined;
                    if (!path || kind === undefined) {
                        return;
                    }
                    // Selection stays pinned to the open file, so pressing a folder
                    // reports it here every time; the press opens or closes it.
                    if (kind === 'directory') {
                        if (isPressRef.current) {
                            onToggleDirectory(path);
                        }
                    } else if (kind === 'file' && path !== selectedPath) {
                        onSelectFile(path);
                    }
                }}
                renderEmptyState={() => (hasQuery ? 'No matching files' : 'No files')}
                selectedKeys={selectedKeys}
                // `replace`, not the default `toggle`: toggle selection puts a
                // checkbox on every row, and this rail picks one file to preview.
                selectionBehavior="replace"
                selectionMode="single"
            >
                {renderNode}
            </FileTree>
        </div>
    );
}

const pressKeys = new Set(['Enter', ' ']);

function indexKinds(
    nodes: WorkspaceTreeNode[],
    index = new Map<string, WorkspaceTreeNode['kind']>()
) {
    for (const node of nodes) {
        index.set(node.id, node.kind);
        if (node.kind === 'directory') {
            indexKinds(node.children, index);
        }
    }
    return index;
}

// Notices are disabled rows, which HeroUI already fades; only a failure
// needs a color of its own.
const noticeToneClass = { danger: 'text-danger', muted: undefined } as const;

const directoryIcon = ({ isExpanded }: { isExpanded: boolean }) => (
    <Icon icon={isExpanded ? FolderOpenIcon : Folder01Icon} />
);

const fileIcon = <Icon icon={File01Icon} />;
