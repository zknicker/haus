import type { ArtifactDeletedRecord } from '@haus/api';
import type { ArtifactCreatorDirectory } from './artifact-creators.ts';
import { artifactTimeLabel } from './artifact-format.ts';
import { artifactFolderWithin } from './drive-folders.ts';

export function deletedRowFacts(
    record: ArtifactDeletedRecord,
    folder: string,
    directory: Pick<ArtifactCreatorDirectory, 'name'>,
    now: number
) {
    const when = artifactTimeLabel(record.deleted_at, now);
    return [
        artifactFolderWithin(record.artifact.path, folder),
        directory.name(record.artifact.author),
        record.deleted_by
            ? `Deleted by ${directory.name(record.deleted_by)} ${when}`
            : `Deleted ${when}`,
    ]
        .filter(Boolean)
        .join(' · ');
}
