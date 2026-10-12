import type { ArtifactMetadata } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { formatArtifactBytes } from './artifact-format.ts';
import { ArtifactRowMenu } from './artifact-row-menu.tsx';
import { ArtifactThumbnail } from './artifact-thumbnail.tsx';

export interface ArtifactRow {
    artifact: ArtifactMetadata;
    /** "<Kind> · <creator> · <time>", already resolved by the caller. */
    meta: string;
}

/**
 * One date group's files as standalone secondary ListView rows: thumbnail, title, meta,
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
            {({ artifact, meta }) => (
                <ListView.Item
                    {...opensPlace}
                    className="artifact-file-trigger"
                    id={artifact.artifact_id}
                    textValue={artifact.title}
                >
                    <ListView.ItemContent>
                        <ArtifactThumbnail artifact={artifact} serverId={serverId} size={32} />
                        <div className="flex min-w-0 flex-col">
                            <ListView.Title>{artifact.title}</ListView.Title>
                            <ListView.Description>{meta}</ListView.Description>
                        </div>
                    </ListView.ItemContent>
                    <ListView.ItemAction>
                        <div className="flex items-center gap-3">
                            <span className="@md:inline hidden text-muted text-sm tabular-nums">
                                {formatArtifactBytes(artifact.size_bytes)}
                            </span>
                            <ArtifactRowMenu
                                artifact={artifact}
                                onOpen={() => onOpen(artifact)}
                                serverId={serverId}
                            />
                        </div>
                    </ListView.ItemAction>
                </ListView.Item>
            )}
        </ListView>
    );
}
