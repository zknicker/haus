import { type ArtifactMetadata, artifactTextMaxBytes } from '@haus/api';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { FileTextPreview, type FileTextRenderer } from '../chats/file-text-preview.tsx';
import { ArtifactFileCard } from './artifact-file-card.tsx';

const tooLargeNote = 'Too large to preview.';

/**
 * A text file drawn the way the Artifact Panel draws workspace files. Blank
 * while the Server reads it; a file too large, not valid UTF-8, or unreadable
 * falls back to its sheet with Download.
 */
export function ArtifactTextPreview({
    artifact,
    renderer,
    serverId,
}: {
    artifact: ArtifactMetadata;
    renderer: FileTextRenderer;
    serverId: string;
}) {
    const fits = artifact.size_bytes <= artifactTextMaxBytes;
    const text = useArtifactText(serverId, artifact.artifact_id, artifact.revision_id, {
        enabled: fits,
    });
    const result = text.data;

    if (!fits || result?.status === 'too_large') {
        return <ArtifactFileCard artifact={artifact} note={tooLargeNote} serverId={serverId} />;
    }
    if (text.error || result?.status === 'binary') {
        return <ArtifactFileCard artifact={artifact} serverId={serverId} />;
    }
    return (
        <section
            aria-busy={result === undefined}
            aria-label="File preview"
            className="artifact-preview artifact-preview--text"
        >
            {result === undefined ? null : (
                <FileTextPreview
                    content={result.text}
                    path={artifact.filename}
                    quoteSource={{ href: artifact.version_url, label: artifact.filename }}
                    renderer={renderer}
                />
            )}
        </section>
    );
}
