import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';

export function backfillProjectRules(
    _db: HausDatabase,
    _storage: ArtifactStorage,
    _closing: AbortSignal
) {
    return Promise.resolve();
}
