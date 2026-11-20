import type { ArtifactRecord } from '@haus/api';

type RevisionLink = Pick<ArtifactRecord, 'parent_revision_id' | 'revision_id'>;

export function revisionCompareBase(versions: readonly RevisionLink[], revisionId: string) {
    const index = versions.findIndex((version) => version.revision_id === revisionId);
    const version = versions[index];
    if (!version) {
        return null;
    }
    return version.parent_revision_id ?? versions[index + 1]?.revision_id ?? null;
}

export function isMergedRevision(
    version: Pick<ArtifactRecord, 'base_revision_id' | 'parent_revision_id'>
) {
    return (
        version.base_revision_id !== null && version.base_revision_id !== version.parent_revision_id
    );
}
