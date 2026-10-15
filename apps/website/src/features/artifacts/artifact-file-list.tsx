import type { ArtifactMetadata } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { formatArtifactBytes } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { PublicLinkMark } from './artifact-public-link-mark.tsx';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { type ArtifactRow, ArtifactRowMeta } from './artifact-row-meta.tsx';
import { ArtifactThumbnail } from './artifact-thumbnail.tsx';
import {
    type LibrarySelection,
    librarySelectionProps,
    useOpenInTabPress,
} from './library-selection.ts';

export type { ArtifactRow } from './artifact-row-meta.tsx';

/**
 * One run of files as standalone secondary ListView rows: thumbnail, file
 * name, meta, then the Kind, Modified, and Size columns the list header names
 * (each once the library is wide enough), and the ⋮ menu. A row being renamed
 * shows its name as a field.
 */
export function ArtifactFileList({
    label,
    onOpen,
    rows,
    selection,
    serverId,
}: {
    label: string;
    onOpen: (artifact: ArtifactMetadata) => void;
    rows: readonly ArtifactRow[];
    selection: LibrarySelection;
    serverId: string;
}) {
    const actions = useArtifactActionsContext();
    const openInTabPress = useOpenInTabPress();
    return (
        <ListView
            aria-label={label}
            className="artifact-file-list"
            items={rows.map((row) => ({ ...row, id: row.artifact.artifact_id }))}
            onAction={(key) => {
                const row = rows.find((entry) => entry.artifact.artifact_id === key);
                if (row) {
                    onOpen(row.artifact);
                }
            }}
            {...librarySelectionProps(
                selection,
                rows.map((row) => row.artifact.artifact_id)
            )}
            variant="secondary"
        >
            {({ artifact, facts, publicLink }) => (
                <ListView.Item
                    {...opensPlace}
                    className="artifact-file-trigger"
                    id={artifact.artifact_id}
                    onPress={openInTabPress(() => onOpen(artifact))}
                    textValue={artifact.filename}
                >
                    <ListView.ItemContent>
                        <ArtifactThumbnail artifact={artifact} serverId={serverId} size={32} />
                        <div className="flex min-w-0 flex-1 flex-col">
                            {actions.renaming?.kind === 'file' &&
                            actions.renaming.path === artifact.path ? (
                                <ArtifactInlineRename
                                    onDone={actions.endRename}
                                    serverId={serverId}
                                    target={actions.renaming}
                                />
                            ) : (
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <ListView.Title>{artifact.filename}</ListView.Title>
                                    {publicLink ? <PublicLinkMark /> : null}
                                </span>
                            )}
                            <ListView.Description>
                                <ArtifactRowMeta columns facts={facts} />
                            </ListView.Description>
                        </div>
                    </ListView.ItemContent>
                    <ListView.ItemAction>
                        <div className="flex items-center gap-3">
                            <span className="artifact-column artifact-column--kind">
                                {facts.kind}
                            </span>
                            <span className="artifact-column artifact-column--modified">
                                {facts.time}
                            </span>
                            <span className="artifact-column artifact-column--size">
                                {formatArtifactBytes(artifact.size_bytes)}
                            </span>
                            <ArtifactRowMenu artifact={artifact} publicLink={publicLink} />
                        </div>
                    </ListView.ItemAction>
                </ListView.Item>
            )}
        </ListView>
    );
}
