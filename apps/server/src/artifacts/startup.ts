import { type EffectRuntime, settle } from '@haus/effect';
import { Effect, Scope } from 'effect';
import { managedSkillSeeder } from '../managed-skills/seeder.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { reconcileArtifacts } from './delete.ts';
import {
    type ArtifactR2Config,
    type ArtifactStorage,
    artifactStorageBytes,
    createR2ArtifactStorage,
} from './storage.ts';
import { ArtifactThumbnails } from './thumbnails.ts';

/**
 * Opens the configured artifact storage, finishes cleanup an earlier process left pending, and
 * starts thumbnail rendering inside the application Scope, so renders in flight settle before the
 * database pool closes.
 */
export async function openArtifactStorage(
    options: {
        artifactR2?: ArtifactR2Config;
        artifactStorage?: ArtifactStorage;
        artifactStorageBytes?: number;
        seedManagedSkills?: boolean;
    },
    db: HausDatabase,
    runtime: EffectRuntime<never>,
    scope: Scope.Scope
) {
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
    const thumbnails = storage
        ? await settle(
              runtime,
              Scope.extend(
                  Effect.acquireRelease(
                      Effect.sync(() => createThumbnails(db, storage, runtime)),
                      (started) => Effect.promise(() => started.close())
                  ),
                  scope
              )
          )
        : null;
    return {
        artifactStorage: storage,
        artifactStorageBytes: options.artifactStorageBytes ?? artifactStorageBytes,
        artifactThumbnails: thumbnails,
        managedSkills: managedSkillSeeder(db, options.seedManagedSkills === false ? null : storage),
    };
}

function createThumbnails(
    db: HausDatabase,
    storage: ArtifactStorage,
    runtime: EffectRuntime<never>
) {
    return new ArtifactThumbnails(db, storage, {
        logFailure: (revisionId, reason, cause) => {
            void settle(
                runtime,
                Effect.logWarning('Artifact thumbnail was not rendered').pipe(
                    Effect.annotateLogs({
                        errorClass: cause instanceof Error ? cause.name : typeof cause,
                        reason,
                        revisionId,
                    })
                )
            );
        },
    });
}
