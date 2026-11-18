import { Card } from '@heroui/react';
import { GridListItem } from 'react-aria-components';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { PublicLinkMark } from './artifact-public-link-mark.tsx';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { type ArtifactRow, ArtifactRowMeta } from './artifact-row-meta.tsx';
import { ArtifactCover } from './artifact-thumbnail.tsx';
import { useOpenInTabPress } from './library-selection.ts';

/**
 * One file as a stock Card tile of the library's grid: a preview well that
 * fits the whole file (a portrait print shows head to toe), then file name,
 * meta, and the ⋮ menu.
 */
export function ArtifactFileTile({
    onOpen,
    row,
    serverId,
}: {
    onOpen: () => void;
    row: ArtifactRow;
    serverId: string;
}) {
    const actions = useArtifactActionsContext();
    const openInTabPress = useOpenInTabPress();
    const { artifact, facts, publicLink } = row;
    return (
        <GridListItem
            {...opensPlace}
            className="artifact-file-tile artifact-file-trigger"
            id={artifact.artifact_id}
            onPress={openInTabPress(onOpen)}
            textValue={artifact.filename}
        >
            <Card>
                <span className="artifact-tile__well artifact-tile__well--cover">
                    <ArtifactCover artifact={artifact} iconSize={44} serverId={serverId} />
                </span>
                <span className="artifact-tile__caption">
                    <span className="artifact-tile__text">
                        {actions.renaming?.kind === 'file' &&
                        actions.renaming.path === artifact.path ? (
                            <ArtifactInlineRename
                                onDone={actions.endRename}
                                serverId={serverId}
                                target={actions.renaming}
                            />
                        ) : (
                            <span className="artifact-tile__title">
                                <span className="truncate">{artifact.filename}</span>
                                {publicLink ? <PublicLinkMark /> : null}
                            </span>
                        )}
                        <span className="artifact-tile__meta">
                            <ArtifactRowMeta facts={facts} />
                        </span>
                    </span>
                    <ArtifactRowMenu artifact={artifact} publicLink={publicLink} />
                </span>
            </Card>
        </GridListItem>
    );
}
