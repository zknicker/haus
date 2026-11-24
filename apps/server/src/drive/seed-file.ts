import { artifactPathBasename } from '@haus/api';
import { advanceHead, markUploaded, readArtifact } from '../artifacts/land.ts';
import { lockLiveServer } from '../artifacts/move.ts';
import { liveArtifactAtPath } from '../artifacts/path.ts';
import { abandonUpload } from '../artifacts/publish.ts';
import { hausAuthorKey } from '../artifacts/read.ts';
import { insertUploadingRevision } from '../artifacts/reserve.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { createArtifactAt } from '../artifacts/write-target.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { driveAreaOfPath } from './areas.ts';

export type DriveSeedOutcome = 'present' | 'raced' | 'written';

export type DriveSeedCreator =
    | { agentId: string; userId: null }
    | { agentId: null; userId: string };

export async function seedDriveFile(
    db: HausDatabase,
    storage: ArtifactStorage,
    seed: { creator: DriveSeedCreator; path: string; serverId: string; text: string }
) {
    const { serverId } = seed;
    const bytes = new TextEncoder().encode(seed.text);
    const reserved = await db.transaction(async (tx) => {
        await lockLiveServer(tx, serverId);
        if (await liveArtifactAtPath(tx, serverId, seed.path)) {
            return null;
        }
        const { path } = await driveAreaOfPath(tx, serverId, seed.path);
        const artifact = await createArtifactAt(tx, { ...seed.creator, serverId }, path);
        const revision = await insertUploadingRevision(
            tx,
            { agentId: null, authorKey: hausAuthorKey, serverId, userId: null, worker: null },
            {
                artifact,
                base: null,
                contentType,
                path: artifact.path,
                requestId: createOpaqueId('seed'),
                reservedBytes: bytes.byteLength,
                taskId: null,
                title: artifactPathBasename(artifact.path),
            }
        );
        return { artifactId: artifact.id, revision };
    });
    if (!reserved) {
        return 'present' satisfies DriveSeedOutcome;
    }
    const uploaded = await storage
        .upload(reserved.revision.objectKey, chunksOf(bytes), contentType)
        .catch(async (cause: unknown) => {
            await abandonUpload(db, storage, reserved.revision, cause);
            throw cause;
        });
    const landed = await db.transaction(async (tx) => {
        await lockLiveServer(tx, serverId);
        const artifact = await readArtifact(tx, reserved.artifactId);
        if (artifact.deletedAt || artifact.currentRevisionId !== null) {
            return false;
        }
        await advanceHead(
            tx,
            serverId,
            artifact,
            await markUploaded(tx, artifact, reserved.revision, uploaded)
        );
        return true;
    });
    if (!landed) {
        await abandonUpload(db, storage, reserved.revision, null);
        return 'raced' satisfies DriveSeedOutcome;
    }
    artifactUpdatedTopic.announce({ artifactId: reserved.artifactId, serverId });
    return 'written' satisfies DriveSeedOutcome;
}

const contentType = 'text/markdown';

async function* chunksOf(bytes: Uint8Array) {
    yield bytes;
}
