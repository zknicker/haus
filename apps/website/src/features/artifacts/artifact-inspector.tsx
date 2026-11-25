import type { ArtifactRecord } from '@haus/api';
import { artifactKindLabel, formatArtifactBytes, formatArtifactDate } from './artifact-format.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/**
 * A file's facts as compact label and value rows. The path row already names
 * the file. Images add their pixel size and, when the file records one, print
 * density.
 */
export function ArtifactInspector({
    artifact,
    serverId,
}: {
    artifact: ArtifactRecord;
    serverId: string;
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const image = artifact.image;
    const facts = [
        { label: 'Kind', value: artifactKindLabel(artifactFileKind(artifact)) },
        { label: 'Size', value: formatArtifactBytes(artifact.size_bytes) },
        image ? { label: 'Dimensions', value: `${image.width} × ${image.height} px` } : null,
        image?.dpi ? { label: 'Resolution', value: `${image.dpi} DPI` } : null,
        { label: 'Created by', value: directory.name(artifact.creator) },
        { label: 'Created', value: formatArtifactDate(artifact.created_at) },
        { label: 'Updated by', value: directory.name(artifact.author) },
        { label: 'Updated', value: formatArtifactDate(artifact.updated_at) },
    ].filter((fact) => fact !== null);
    return (
        <dl className="artifact-facts">
            {facts.map((fact) => (
                <div className="artifact-facts__row" key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd title={fact.value}>{fact.value}</dd>
                </div>
            ))}
        </dl>
    );
}
