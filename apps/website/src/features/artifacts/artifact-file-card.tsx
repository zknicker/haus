import type { ArtifactMetadata } from '@haus/api';
import { Button } from '@heroui/react';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { artifactKindLabel, formatArtifactBytes } from './artifact-format.ts';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';

/**
 * A file the App does not render inline: its sheet, its facts, and the way to
 * download it, in the quiet file well. `note` says why when the file would
 * otherwise have rendered (too large to preview).
 */
export function ArtifactFileCard({
    artifact,
    note,
    serverId,
}: {
    artifact: ArtifactMetadata;
    note?: string;
    serverId: string;
}) {
    const { saveFile, saving } = useArtifactSave(serverId);
    const kind = artifactFileKind(artifact);
    return (
        <section aria-label="File preview" className="artifact-preview artifact-preview--file">
            <div className="flex flex-col items-center gap-4 text-center">
                <ArtifactFileIcon kind={kind} size={96} />
                <div className="flex flex-col gap-1">
                    <p className="break-all font-medium text-foreground text-sm">
                        {artifact.filename}
                    </p>
                    <p className="text-muted text-sm">
                        {artifactKindLabel(kind)} · {formatArtifactBytes(artifact.size_bytes)}
                    </p>
                    {note ? <p className="text-muted text-sm">{note}</p> : null}
                </div>
                <Button
                    isPending={saving}
                    onPress={() =>
                        saveFile({
                            artifactId: artifact.artifact_id,
                            revisionId: artifact.revision_id,
                        })
                    }
                    size="sm"
                    variant="secondary"
                >
                    Download
                </Button>
            </div>
        </section>
    );
}
