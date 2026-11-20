import { type ArtifactRecord, artifactTextMaxBytes } from '@haus/api';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
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
    if (page.status === 'ready') {
        return <DrivePageDocument artifact={page.artifact} serverId={serverId} />;
    }
    return <DrivePageUnavailable path={target.path} status={page.status} />;
}

export function DrivePageUnavailable({
    path,
    status,
}: {
    path: string;
    status: 'failed' | 'missing';
}) {
    return (
        <WorkspaceArtifactEmpty
            detail={
                status === 'missing'
                    ? 'This page was moved or deleted.'
                    : 'Haus could not open this page. Try again in a moment.'
            }
            title={path}
        />
    );
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
