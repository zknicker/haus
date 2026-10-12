import type { ArtifactMetadata } from '@haus/api';
import { Button } from '@heroui/react';
import { Timeline } from '@heroui-pro/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../../components/copy-button.tsx';
import { useArtifactVersions } from '../../hooks/artifacts/use-artifacts.ts';
import { artifactPath, fileKind, formatArtifactBytes } from './artifact-format.ts';

export function ArtifactInspector({
    artifact,
    serverId,
    slug,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
    slug: string;
}) {
    return (
        <aside
            aria-label="Artifact details"
            className="flex h-full flex-col gap-6 overflow-y-auto p-5"
        >
            <section className="flex flex-col gap-3">
                <h2 className="font-semibold text-sm">File details</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted">Name</dt>
                    <dd className="break-all">{artifact.filename}</dd>
                    <dt className="text-muted">Type</dt>
                    <dd>{fileKind(artifact.content_type)}</dd>
                    <dt className="text-muted">Size</dt>
                    <dd>{formatArtifactBytes(artifact.size_bytes)}</dd>
                    <dt className="text-muted">Published</dt>
                    <dd>{new Date(artifact.created_at).toLocaleDateString()}</dd>
                </dl>
                <p className="text-muted text-xs">Shared with this Server's members.</p>
                <div className="flex items-center justify-between text-sm">
                    <span>Current link</span>
                    <CopyButton label="Copy current artifact link" value={artifact.stable_url} />
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span>This revision</span>
                    <CopyButton label="Copy fixed revision link" value={artifact.version_url} />
                </div>
            </section>
            <ArtifactVersions
                artifactId={artifact.artifact_id}
                revisionId={artifact.revision_id}
                serverId={serverId}
                slug={slug}
            />
        </aside>
    );
}
function ArtifactVersions({
    artifactId,
    revisionId,
    serverId,
    slug,
}: {
    artifactId: string;
    revisionId: string;
    serverId: string;
    slug: string;
}) {
    const [offset, setOffset] = useState(0);
    const query = useArtifactVersions(serverId, artifactId, offset);
    const path = artifactPath(slug, artifactId);
    return (
        <section aria-label="Revisions" className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">Revisions</h2>
                <Link className="text-accent text-xs" to={path}>
                    Latest
                </Link>
            </div>
            {query.error ? <p role="alert">{query.error.message}</p> : null}
            <Timeline density="compact" size="sm">
                {query.data?.versions.map((version) => (
                    <Timeline.Item
                        key={version.revision_id}
                        status={version.revision_id === revisionId ? 'current' : 'default'}
                    >
                        <Timeline.Marker />
                        <Timeline.Connector />
                        <Timeline.Content>
                            <Link
                                aria-current={
                                    version.revision_id === revisionId ? 'page' : undefined
                                }
                                className="text-sm"
                                to={`${path}?revision=${encodeURIComponent(version.revision_id)}`}
                            >
                                Revision {version.revision_number}
                                {version.revision_id === revisionId ? ' · Viewing' : ''}
                            </Link>
                            <p className="mt-1 text-muted text-xs">
                                {new Date(version.created_at).toLocaleString()}
                            </p>
                        </Timeline.Content>
                    </Timeline.Item>
                ))}
            </Timeline>
            <div className="flex gap-2">
                <Button
                    isDisabled={offset === 0}
                    onPress={() => setOffset(Math.max(0, offset - 50))}
                    size="sm"
                    variant="ghost"
                >
                    Newer
                </Button>
                <Button
                    isDisabled={!query.data || query.data.versions.length < 50}
                    onPress={() => setOffset(offset + 50)}
                    size="sm"
                    variant="ghost"
                >
                    Older
                </Button>
                <Button
                    aria-label="Refresh revisions"
                    onPress={() => query.refetch()}
                    size="sm"
                    variant="ghost"
                >
                    Refresh
                </Button>
            </div>
        </section>
    );
}
