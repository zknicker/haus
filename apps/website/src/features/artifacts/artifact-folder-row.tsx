import type { ArtifactMetadata } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { artifactTimeLabel, formatArtifactBytes } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
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
                    size={32}
                    tone={artifactFolderTone(folder.path)}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    {renaming && actions.renaming ? (
                        <ArtifactInlineRename
                            onDone={actions.endRename}
                            serverId={serverId}
                            target={actions.renaming}
                        />
                    ) : (
                        <ListView.Title>{folder.name}</ListView.Title>
                    )}
                    <ListView.Description>
                        {within ? `${within} · ${count}` : count}
                    </ListView.Description>
                </div>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <div className="flex items-center gap-3">
                    <span className="artifact-column artifact-column--kind">Folder</span>
                    <span className="artifact-column artifact-column--modified">
                        {folder.updated_at ? artifactTimeLabel(folder.updated_at, now) : '—'}
                    </span>
                    <span className="artifact-column artifact-column--size">
                        {empty ? '—' : formatArtifactBytes(folder.size_bytes)}
                    </span>
                    <span aria-hidden="true" className="artifact-column artifact-column--menu" />
                </div>
            </ListView.ItemAction>
        </ListView.Item>
    );
}
