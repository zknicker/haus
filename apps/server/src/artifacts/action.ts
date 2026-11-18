import { type ArtifactListFilters, artifactListInputSchema } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ArtifactActor } from './access.ts';
import { deleteArtifact } from './delete.ts';
import { listArtifactDrive } from './list.ts';
import { downloadArtifact, getArtifact, listArtifactVersions, toArtifactMetadata } from './read.ts';
import { ArtifactError, type ArtifactStorage } from './storage.ts';

export type ArtifactAction = 'list' | 'get' | 'versions' | 'download' | 'delete' | 'deleteVersion';
/** List filters with every default applied: the root folder, 50 newest files. */
export const defaultArtifactListFilters: ArtifactListFilters = artifactListInputSchema
    .omit({ serverId: true })
    .parse({});

export async function runArtifactAction(options: {
    action: ArtifactAction;
    db: HausDatabase;
    storage: ArtifactStorage | null;
    actor: ArtifactActor;
    origin: string;
    input: {
        artifact_id: string;
        revision_id?: string;
        offset: number;
        /** Drive listing for `list`; ignored by every other action. */
        filters?: ArtifactListFilters;
    };
}) {
    const { action, actor, db, input, origin, storage } = options;
    switch (action) {
        case 'list': {
            const page = await listArtifactDrive(db, actor, origin, {
                ...(input.filters ?? defaultArtifactListFilters),
                offset: input.offset,
            });
            return { ...page, artifacts: page.artifacts.map(toArtifactMetadata) };
        }
        case 'get':
            return {
                artifact: (
                    await getArtifact(db, actor, origin, input.artifact_id, input.revision_id)
                ).metadata,
            };
        case 'versions': {
            const versions = await listArtifactVersions(
                db,
                actor,
                origin,
                input.artifact_id,
                input.offset
            );
            return { versions: versions.map(toArtifactMetadata) };
        }
        case 'download':
            return await downloadArtifact(
                db,
                actor,
                origin,
                storage,
                input.artifact_id,
                input.revision_id
            );
        case 'delete':
            return await deleteArtifact(db, actor, storage, input.artifact_id);
        case 'deleteVersion': {
            if (!input.revision_id) {
                throw new ArtifactError('revision_id is required.', 400, 'INVALID_ARG');
            }
            return await deleteArtifact(db, actor, storage, input.artifact_id, input.revision_id);
        }
        default: {
            const exhaustive: never = action;
            return exhaustive;
        }
    }
}
