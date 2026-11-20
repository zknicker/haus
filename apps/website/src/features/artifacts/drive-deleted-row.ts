import type { ArtifactDeletedRecord } from '@haus/api';
import type { ArtifactCreatorDirectory } from './artifact-creators.ts';
import { artifactTimeLabel } from './artifact-format.ts';
import { artifactFolderWithin, middleTruncatedName } from './drive-folders.ts';

const folderMax = 28;

export function deletedRowFacts(
    record: ArtifactDeletedRecord,
    folder: string,
    directory: Pick<ArtifactCreatorDirectory, 'name'>,
    now: number
) {
    const when = artifactTimeLabel(record.deleted_at, now);
    return [
        record.deleted_by
            ? `Deleted by ${directory.name(record.deleted_by)} ${when}`
            : `Deleted ${when}`,
        directory.name(record.artifact.author),
        middleTruncatedName(artifactFolderWithin(record.artifact.path, folder), folderMax),
    ]
        .filter(Boolean)
        .join(' · ');
}
