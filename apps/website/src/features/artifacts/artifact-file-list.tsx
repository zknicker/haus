import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { formatArtifactBytes } from './artifact-format.ts';
import { PublicLinkMark } from './artifact-public-link-mark.tsx';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { ArtifactThumbnail } from './artifact-thumbnail.tsx';

export interface ArtifactRow {
    artifact: ArtifactMetadata;
    /** "[<title> · ][<folder> · ]<kind> · <creator> · <time>", resolved by the caller. */
    meta: string;
    /** The file's public link, from its library page. */
    publicLink: ArtifactPublicLink | null;
}

/**
 * One date group's files as standalone secondary ListView rows: thumbnail, file name, meta,
 * then size and the ⋮ menu.
 */
export function ArtifactFileList({
    label,
    onOpen,
    rows,
    serverId,
}: {
    label: string;
    onOpen: (artifact: ArtifactMetadata) => void;
    rows: readonly ArtifactRow[];
    serverId: string;
}) {
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
            variant="secondary"
        >
            {({ artifact, meta, publicLink }) => (
                <ListView.Item
                    {...opensPlace}
                    className="artifact-file-trigger"
                    id={artifact.artifact_id}
                    textValue={artifact.filename}
                >
                    <ListView.ItemContent>
                        <ArtifactThumbnail artifact={artifact} serverId={serverId} size={32} />
                        <div className="flex min-w-0 flex-col">
                            <ListView.Title>{artifact.filename}</ListView.Title>
                            <ListView.Description>{meta}</ListView.Description>
                        </div>
                    </ListView.ItemContent>
                    <ListView.ItemAction>
                        <div className="flex items-center gap-3">
                            {publicLink ? <PublicLinkMark /> : null}
                            <span className="@md:inline hidden text-muted text-sm tabular-nums">
                                {formatArtifactBytes(artifact.size_bytes)}
                            </span>
                            <ArtifactRowMenu
                                artifact={artifact}
                                onOpen={() => onOpen(artifact)}
                                publicLink={publicLink}
                                serverId={serverId}
                            />
                        </div>
                    </ListView.ItemAction>
                </ListView.Item>
            )}
        </ListView>
    );
}
