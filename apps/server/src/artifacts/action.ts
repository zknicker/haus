import type { ArtifactListInput } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ArtifactActor } from './access.ts';
import { deleteArtifact } from './delete.ts';
import { downloadArtifact, getArtifact, listArtifacts } from './read.ts';
import { ArtifactError, type ArtifactStorage } from './storage.ts';

export type ArtifactAction = 'list' | 'get' | 'versions' | 'download' | 'delete' | 'deleteVersion';
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
        /** Library filters for `list`; ignored by every other action. */
        filters?: Pick<ArtifactListInput, 'creator' | 'kind' | 'query'>;
    };
}) {
    const { action, actor, db, input, origin, storage } = options;
    switch (action) {
        case 'list':
            return {
                artifacts: await listArtifacts(
                    db,
                    actor,
                    origin,
                    input.offset,
                    undefined,
                    input.filters
                ),
            };
        case 'get':
            return {
                artifact: (
                    await getArtifact(db, actor, origin, input.artifact_id, input.revision_id)
                ).metadata,
            };
        case 'versions':
            return {
                versions: await listArtifacts(db, actor, origin, input.offset, input.artifact_id),
            };
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
