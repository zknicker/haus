import { type ArtifactRecord, artifactTextMaxBytes } from '@haus/api';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { useDrivePage } from '../../hooks/artifacts/use-drive-page.ts';
import { ArtifactFileCard } from '../artifacts/artifact-file-card.tsx';
import { artifactTextRenderer } from '../artifacts/artifact-text.ts';
import { WorkspaceArtifactEmpty } from './chat-artifact-workspace-preview.tsx';
import { FileTextPreview } from './file-text-preview.tsx';
import type { DrivePageTarget } from './haus-resource-link.ts';

export function DrivePagePane({ serverId, target }: { serverId: string; target: DrivePageTarget }) {
    const page = useDrivePage(serverId, target);
    if (page.status === 'loading') {
        return null;
    }
    if (page.status === 'missing') {
        return <DrivePageMissing path={target.path} />;
    }
    return (
        <DrivePageRevision
            artifactId={page.artifactId}
            path={target.path}
            revisionId={page.revisionId}
            serverId={serverId}
        />
    );
}

export function DrivePageMissing({ path }: { path: string }) {
    return <WorkspaceArtifactEmpty detail="This page was moved or deleted." title={path} />;
}

function DrivePageRevision({
    artifactId,
    path,
    revisionId,
    serverId,
}: {
    artifactId: string;
    path: string;
    revisionId?: string;
    serverId: string;
}) {
    const query = useArtifact(serverId, artifactId, revisionId);
    const artifact = query.data?.artifact;
    if (query.error) {
        return <DrivePageMissing path={path} />;
    }
    return artifact ? <DrivePageDocument artifact={artifact} serverId={serverId} /> : null;
}

function DrivePageDocument({ artifact, serverId }: { artifact: ArtifactRecord; serverId: string }) {
    const renderer = artifactTextRenderer(artifact);
    const fits = artifact.size_bytes <= artifactTextMaxBytes;
    const text = useArtifactText(serverId, artifact.artifact_id, artifact.revision_id, {
        enabled: renderer !== null && fits,
    });
    const result = text.data;
    if (!(renderer && fits) || text.error || (result && result.status !== 'text')) {
        return (
            <div className="h-full overflow-auto p-6">
                <ArtifactFileCard artifact={artifact} serverId={serverId} />
            </div>
        );
    }
    if (result === undefined) {
        return null;
    }
    return (
        <FileTextPreview
            content={result.text}
            path={artifact.filename}
            quoteSource={{ href: artifact.version_url, label: artifact.filename }}
            renderer={renderer}
        />
    );
}
