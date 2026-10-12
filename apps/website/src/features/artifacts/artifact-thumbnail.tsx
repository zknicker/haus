import type { ArtifactMetadata } from '@haus/api';
import { File, FileText, Image, Music, Video } from 'lucide-react';
import { useState } from 'react';
import { useArtifactDownload } from '../../hooks/artifacts/use-artifacts.ts';
import { fileKind, hasLibraryPreview } from './artifact-format.ts';

export function ArtifactThumbnail({
    artifact,
    serverId,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
}) {
    return hasLibraryPreview(artifact) ? (
        <ImageThumbnail artifact={artifact} key={artifact.revision_id} serverId={serverId} />
    ) : (
        <ArtifactFileIcon type={artifact.content_type} />
    );
}
function ImageThumbnail({ artifact, serverId }: { artifact: ArtifactMetadata; serverId: string }) {
    const query = useArtifactDownload(serverId, artifact.artifact_id, artifact.revision_id);
    const [failed, setFailed] = useState(false);
    if (!query.data || failed) {
        return <ArtifactFileIcon type={artifact.content_type} />;
    }
    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load failures are not user interaction.
        <img
            alt=""
            className="h-full w-full object-contain"
            height={240}
            loading="lazy"
            onError={() => setFailed(true)}
            src={query.data.download_url}
            width={320}
        />
    );
}
export function ArtifactFileIcon({ type }: { type: string }) {
    const kind = fileKind(type);
    const Glyph =
        kind === 'Image'
            ? Image
            : kind === 'Video'
              ? Video
              : kind === 'Audio'
                ? Music
                : kind === 'Document' || kind === 'PDF'
                  ? FileText
                  : File;
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted">
            <Glyph aria-hidden="true" size={32} />
            <span className="text-xs">{kind}</span>
        </div>
    );
}
