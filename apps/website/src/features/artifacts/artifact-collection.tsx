import type { ArtifactMetadata } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Link } from 'react-router-dom';
import { artifactPath, formatArtifactBytes } from './artifact-format.ts';
import { ArtifactThumbnail } from './artifact-thumbnail.tsx';

interface CollectionProps {
    artifacts: ArtifactMetadata[];
    serverId: string;
    slug: string;
}
export function ArtifactGrid({ artifacts, serverId, slug }: CollectionProps) {
    return (
        <ul
            aria-label="Shared artifacts"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-x-3 gap-y-5"
        >
            {artifacts.map((artifact) => (
                <li key={artifact.artifact_id}>
                    <Link
                        aria-label={artifact.title}
                        className="block"
                        to={artifactPath(slug, artifact.artifact_id)}
                    >
                        <div className="artifact-tile__preview">
                            <ArtifactThumbnail artifact={artifact} serverId={serverId} />
                        </div>
                        <p className="mt-2 truncate text-sm">{artifact.title}</p>
                        <p className="mt-0.5 truncate text-muted text-xs">
                            {formatArtifactBytes(artifact.size_bytes)} · Revision{' '}
                            {artifact.revision_number}
                        </p>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
export function ArtifactList({ artifacts, serverId, slug }: CollectionProps) {
    return (
        <ListView aria-label="Shared artifacts" selectionMode="none" variant="primary">
            {artifacts.map((artifact) => (
                <ListView.Item
                    href={artifactPath(slug, artifact.artifact_id)}
                    id={artifact.artifact_id}
                    key={artifact.artifact_id}
                    textValue={artifact.title}
                >
                    <ListView.ItemContent>
                        <div className="h-12 w-16 shrink-0">
                            <ArtifactThumbnail artifact={artifact} serverId={serverId} />
                        </div>
                        <div className="min-w-0">
                            <ListView.Title>{artifact.title}</ListView.Title>
                            <ListView.Description>
                                {artifact.filename} · {formatArtifactBytes(artifact.size_bytes)} ·
                                Revision {artifact.revision_number}
                            </ListView.Description>
                        </div>
                    </ListView.ItemContent>
                </ListView.Item>
            ))}
        </ListView>
    );
}
