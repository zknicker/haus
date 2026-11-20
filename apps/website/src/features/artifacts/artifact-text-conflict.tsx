import { type ArtifactMetadata, artifactTextMaxBytes } from '@haus/api';
import { Alert } from '@heroui/react';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { ArtifactDiff } from './artifact-diff.tsx';

export function ArtifactTextConflict({
    current,
    message,
    serverId,
    text,
}: {
    current: ArtifactMetadata | null;
    message: string;
    serverId: string;
    text: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Your save could not merge</Alert.Title>
                    <Alert.Description>
                        {current
                            ? `Revision ${current.revision_number} changed the same lines. Compare it with your text, then save again.`
                            : message}
                    </Alert.Description>
                </Alert.Content>
            </Alert>
            {current ? <ConflictDiff current={current} serverId={serverId} text={text} /> : null}
        </div>
    );
}

function ConflictDiff({
    current,
    serverId,
    text,
}: {
    current: ArtifactMetadata;
    serverId: string;
    text: string;
}) {
    const fits = current.size_bytes <= artifactTextMaxBytes;
    const read = useArtifactText(serverId, current.artifact_id, current.revision_id, {
        enabled: fits,
    });
    const failure = !fits
        ? 'Too large to compare.'
        : (read.error?.message ??
          (read.data && read.data.status !== 'text'
              ? 'This revision is not readable as text.'
              : null));
    return (
        <section aria-label="Your text compared with the current revision">
            <p className="text-muted mb-2 text-sm">
                {`Revision ${current.revision_number} → Your text`}
            </p>
            <div aria-busy={read.isPending} className="artifact-preview artifact-preview--text">
                {read.data?.status === 'text' ? (
                    <div className="h-full overflow-y-auto">
                        <ArtifactDiff
                            filename={current.filename}
                            from={read.data.text}
                            fromRevisionId={current.revision_id}
                            to={text}
                            toRevisionId={null}
                        />
                    </div>
                ) : failure ? (
                    <p className="text-muted text-sm" role="alert">
                        {failure}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
