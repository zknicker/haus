import type { ArtifactMetadata } from '@haus/api';
import { Card } from '@heroui/react';
import { GridList, GridListItem } from 'react-aria-components';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import type { ArtifactRow } from './artifact-file-list.tsx';
import { PublicLinkMark } from './artifact-public-link-mark.tsx';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { ArtifactCover } from './artifact-thumbnail.tsx';
import {
    type LibrarySelection,
    librarySelectionProps,
    useOpenInTabPress,
} from './library-selection.ts';

/** One date group's files as stock Cards: a preview well, then file name, meta, and the ⋮ menu. */
export function ArtifactFileGrid({
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
    const openInTabPress = useOpenInTabPress();
    return (
        <GridList
            aria-label={label}
            className="artifact-file-grid"
            items={rows.map((row) => ({ ...row, id: row.artifact.artifact_id }))}
            layout="grid"
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
        >
            {({ artifact, meta, publicLink }) => (
                <GridListItem
                    {...opensPlace}
                    className="artifact-file-tile artifact-file-trigger"
                    id={artifact.artifact_id}
                    onPress={openInTabPress(() => onOpen(artifact))}
                    textValue={artifact.filename}
                >
                    <Card>
                        <span className="artifact-tile__well artifact-tile__well--cover">
                            <ArtifactCover artifact={artifact} iconSize={44} serverId={serverId} />
                        </span>
                        <span className="artifact-tile__caption">
                            <span className="artifact-tile__text">
                                <span className="artifact-tile__title">
                                    <span className="truncate">{artifact.filename}</span>
                                    {publicLink ? <PublicLinkMark /> : null}
                                </span>
                                <span className="artifact-tile__meta">{meta}</span>
                            </span>
                            <ArtifactRowMenu artifact={artifact} publicLink={publicLink} />
                        </span>
                    </Card>
                </GridListItem>
            )}
        </GridList>
    );
}
