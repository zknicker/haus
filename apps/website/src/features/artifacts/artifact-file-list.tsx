import { ListView } from '@heroui-pro/react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { formatArtifactBytes } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { PublicLinkMark } from './artifact-public-link-mark.tsx';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { type ArtifactRow, FileRowAside } from './artifact-row-meta.tsx';
import { ArtifactThumbnail } from './artifact-thumbnail.tsx';
import { useLibraryItemPress } from './library-selection.ts';

export type { ArtifactRow } from './artifact-row-meta.tsx';

/**
 * One file as a single-line secondary ListView row of the library's list:
 * icon, file name and its aside, then the Updated by, Modified, and Size
 * columns the list header names (each once the library is wide enough), and
 * the ⋮ menu. A row being renamed shows its name as a field.
 */
export function ArtifactFileRow({
    onOpen,
    row,
    serverId,
}: {
    onOpen: () => void;
    row: ArtifactRow;
    serverId: string;
}) {
    const actions = useArtifactActionsContext();
    const openOnPress = useLibraryItemPress();
    const { artifact, facts, publicLink } = row;
    const renaming = actions.renaming?.kind === 'file' && actions.renaming.path === artifact.path;
    return (
        <ListView.Item
            {...opensPlace}
            className="artifact-file-trigger"
            id={artifact.artifact_id}
            onPress={openOnPress(onOpen)}
            textValue={artifact.filename}
        >
            <ListView.ItemContent>
                <ArtifactThumbnail artifact={artifact} serverId={serverId} size={20} />
                {renaming && actions.renaming ? (
                    <ArtifactInlineRename
                        onDone={actions.endRename}
                        serverId={serverId}
                        target={actions.renaming}
                    />
                ) : (
                    <span className="artifact-row-name">
                        <ListView.Title>{artifact.filename}</ListView.Title>
                        {publicLink ? <PublicLinkMark /> : null}
                        <FileRowAside facts={facts} />
                    </span>
                )}
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="artifact-row-columns">
                    <span className="artifact-column artifact-column--detail">{facts.author}</span>
                    <span className="artifact-column artifact-column--modified">{facts.time}</span>
                    <span className="artifact-column artifact-column--size">
                        {formatArtifactBytes(artifact.size_bytes)}
                    </span>
                    <ArtifactRowMenu artifact={artifact} publicLink={publicLink} />
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}
