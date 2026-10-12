import { type EffectRuntime, settle } from '@haus/effect';
import { Effect } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { reconcileArtifacts } from './delete.ts';
import { type ArtifactR2Config, type ArtifactStorage, createR2ArtifactStorage } from './storage.ts';

/** Opens the configured artifact storage and finishes cleanup an earlier process left pending. */
export async function openArtifactStorage(
    options: { artifactR2?: ArtifactR2Config; artifactStorage?: ArtifactStorage },
    db: HausDatabase,
    runtime: EffectRuntime<never>
): Promise<ArtifactStorage | null> {
    const storage =
        options.artifactStorage ??
        (options.artifactR2 ? createR2ArtifactStorage(options.artifactR2) : null);
    const recovery = await reconcileArtifacts(db, storage);
    if (recovery.failedRevisionIds.length) {
        await settle(
            runtime,
            Effect.logWarning('Artifact cleanup remains pending').pipe(
                Effect.annotateLogs({ revisionIds: recovery.failedRevisionIds.join(',') })
            )
        );
    }
    return storage;
}
