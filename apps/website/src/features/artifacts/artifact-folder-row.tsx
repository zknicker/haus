import type { ArtifactMetadata } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { artifactTimeLabel, formatArtifactBytes } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { ArtifactRowAside } from './artifact-row-meta.tsx';
import { artifactFolderTone } from './drive-folders.ts';
import type { DriveFolder } from './drive-places.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { useLibraryItemPress } from './library-selection.ts';
import { folderCountLabel, useFolderPeeks } from './use-folder-peeks.ts';

export function ArtifactFolderRow({
    dropTarget,
    folder,
    onOpen,
    previews,
    serverId,
    within,
}: {
    dropTarget: boolean;
    folder: DriveFolder;
    onOpen: () => void;
    previews: readonly ArtifactMetadata[];
    serverId: string;
    within: string;
}) {
    const actions = useArtifactActionsContext();
    const openOnPress = useLibraryItemPress();
    const peeks = useFolderPeeks(previews, serverId);
    const now = useRelativeNow(60_000);
    const count = folderCountLabel(folder.file_count);
    const renaming = actions.renaming?.kind === 'folder' && actions.renaming.path === folder.path;
    const empty = folder.file_count === 0;
    const time = folder.updated_at ? artifactTimeLabel(folder.updated_at, now) : '—';
    return (
        <ListView.Item
            className="artifact-folder-list-row artifact-folder-trigger"
            data-move-target={dropTarget || undefined}
            id={folder.path}
            onPress={openOnPress(onOpen)}
            textValue={folder.name}
        >
            <ListView.ItemContent>
                <ArtifactFolderIcon
                    previews={peeks}
                    size={22}
                    tone={artifactFolderTone(folder.path)}
                />
                {renaming && actions.renaming ? (
                    <ArtifactInlineRename
                        onDone={actions.endRename}
                        serverId={serverId}
                        target={actions.renaming}
                    />
                ) : (
                    <span className="artifact-row-name">
                        <ListView.Title>{folder.name}</ListView.Title>
                        <ArtifactRowAside
                            lead={within ? [{ key: 'within', part: within }] : []}
                            narrow={[{ column: 'detail', key: 'count', part: count }]}
                        />
                    </span>
                )}
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="artifact-row-columns">
                    <span className="artifact-column artifact-column--detail">
                        <span className="artifact-column__files">
                            {empty ? '—' : folder.file_count.toLocaleString()}
                        </span>
                        <span className="artifact-column__author">—</span>
                    </span>
                    <span className="artifact-column artifact-column--modified">{time}</span>
                    <span className="artifact-column artifact-column--size">
                        {empty ? '—' : formatArtifactBytes(folder.size_bytes)}
                    </span>
                    <span aria-hidden="true" className="artifact-column artifact-column--menu" />
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}
