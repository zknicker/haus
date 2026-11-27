import type { ArtifactRecord } from '@haus/api';
import { useArtifactText } from '../../../hooks/artifacts/use-artifact-text.ts';
import { ArtifactTextPreview } from '../../artifacts/artifact-text-preview.tsx';
import type { artifactTextRenderer } from '../../artifacts/artifact-text.ts';
import { MarkdownDocument } from '../../artifacts/markdown/markdown-document.tsx';

export function AgentsMdView({
    artifact,
    renderer,
    serverId,
}: {
    artifact: ArtifactRecord;
    renderer: NonNullable<ReturnType<typeof artifactTextRenderer>>;
    serverId: string;
}) {
    const read = useArtifactText(serverId, artifact.artifact_id, artifact.revision_id, {
        enabled: renderer === 'markdown',
    });
    if (renderer !== 'markdown' || read.error || read.data?.status === 'too_large') {
        return <ArtifactTextPreview artifact={artifact} renderer={renderer} serverId={serverId} />;
    }
    const text = read.data?.status === 'text' ? read.data.text : null;
    return (
        <section aria-busy={text === null} aria-label="File" className="artifact-document">
            {text === null ? null : (
                <MarkdownDocument
                    key={artifact.revision_id}
                    label={artifact.filename}
                    onChange={ignoreEdit}
                    original={text}
                    readOnly
                    text={text}
                />
            )}
        </section>
    );
}

function ignoreEdit() {
    return undefined;
}
