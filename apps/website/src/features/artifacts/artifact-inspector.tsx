import type { ArtifactMetadata } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import { artifactKindLabel, formatArtifactBytes, formatArtifactDate } from './artifact-format.ts';
import { ArtifactRevisions } from './artifact-revisions.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/** File facts and revision history beside the preview. */
export function ArtifactInspector({
    artifact,
    serverId,
    slug,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
    slug: string;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const facts = [
        { label: 'Name', value: artifact.filename },
        { label: 'Kind', value: artifactKindLabel(artifactFileKind(artifact)) },
        { label: 'Size', value: formatArtifactBytes(artifact.size_bytes) },
        { label: 'Created by', value: directory.name(artifact.creator) },
        { label: 'Created', value: formatArtifactDate(artifact.created_at) },
        { label: 'Updated', value: formatArtifactDate(artifact.updated_at) },
    ];
    return (
        <aside aria-label="File details" className="flex min-w-0 flex-col gap-8">
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Details</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {facts.map((fact, index) => (
                    <Fragment key={fact.label}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>{fact.label}</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action className="min-w-0">
                                <SettingsFact className="block truncate" title={fact.value}>
                                    {fact.value}
                                </SettingsFact>
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                ))}
            </ItemCardGroup>
            <ArtifactRevisions
                artifactId={artifact.artifact_id}
                serverId={serverId}
                slug={slug}
                viewingRevisionId={artifact.revision_id}
            />
        </aside>
    );
}
