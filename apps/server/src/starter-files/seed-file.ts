import { artifactPathBasename, artifactPathKey } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { advanceHead, markUploaded, readArtifact } from '../artifacts/land.ts';
import { lockLiveServer } from '../artifacts/move.ts';
import { liveArtifactAtPath } from '../artifacts/path.ts';
import { abandonUpload } from '../artifacts/publish.ts';
import { hausAuthorKey } from '../artifacts/read.ts';
import { insertUploadingRevision } from '../artifacts/reserve.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { createArtifactAt } from '../artifacts/write-target.ts';
import { driveAreaOfPath } from '../drive/areas.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, artifactsTable as artifacts } from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';

export type StarterFileOutcome = 'held' | 'raced' | 'retired' | 'written';

export interface StarterFile {
    readonly creator: { agentId: string; userId: null } | { agentId: null; userId: string };
    readonly path: string;
    readonly text: string;
    readonly unless: 'ever-held' | 'live';
}

export async function seedStarterFile(
    db: HausDatabase,
    storage: ArtifactStorage,
    serverId: string,
    file: StarterFile
) {
    const bytes = new TextEncoder().encode(file.text);
    const planned = await db.transaction((tx) => reserve(tx, serverId, file, bytes.byteLength));
    if (typeof planned === 'string') {
        const outcome: StarterFileOutcome = planned;
        return outcome;
    }
    let uploaded: { sha256: string; size: number };
    try {
        uploaded = await storage.upload(planned.revision.objectKey, chunksOf(bytes), contentType);
    } catch (cause) {
        await abandonUpload(db, storage, planned.revision, cause);
        throw cause;
    }
    const landed = await db.transaction(async (tx) => {
        await lockLiveServer(tx, serverId);
        const artifact = await readArtifact(tx, planned.artifact.id);
        if (artifact.deletedAt || artifact.currentRevisionId !== null) {
            return false;
        }
        await advanceHead(
            tx,
            serverId,
            artifact,
            await markUploaded(tx, artifact, planned.revision, uploaded)
        );
        return true;
    });
    if (!landed) {
        await abandonUpload(db, storage, planned.revision, null);
        const outcome: StarterFileOutcome = 'raced';
        return outcome;
    }
    artifactUpdatedTopic.announce({ artifactId: planned.artifact.id, serverId });
    const outcome: StarterFileOutcome = 'written';
    return outcome;
}

const contentType = 'text/markdown';

async function reserve(tx: HausDatabase, serverId: string, file: StarterFile, size: number) {
    await lockLiveServer(tx, serverId);
    const { area } = await driveAreaOfPath(tx, serverId, file.path);
    if (file.creator.agentId !== null) {
        const owner = file.creator.agentId;
        if (area !== `agent:${owner}` || !(await isLiveAgent(tx, serverId, owner))) {
            return 'retired';
        }
    }
    if (await isHeld(tx, serverId, file)) {
        return 'held';
    }
    const artifact = await createArtifactAt(tx, { ...file.creator, serverId }, file.path);
    const revision = await insertUploadingRevision(
        tx,
        { agentId: null, authorKey: hausAuthorKey, serverId, userId: null, worker: null },
        {
            artifact,
            base: null,
            contentType,
            path: artifact.path,
            requestId: createOpaqueId('seed'),
            reservedBytes: size,
            taskId: null,
            title: artifactPathBasename(artifact.path),
        }
    );
    return { artifact, revision };
}

async function isHeld(tx: HausDatabase, serverId: string, file: StarterFile) {
    if (file.unless === 'live') {
        return Boolean(await liveArtifactAtPath(tx, serverId, file.path));
    }
    const [row] = await tx
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(
            and(eq(artifacts.serverId, serverId), eq(artifacts.pathKey, artifactPathKey(file.path)))
        )
        .limit(1);
    return Boolean(row);
}

async function isLiveAgent(tx: HausDatabase, serverId: string, agentId: string) {
    const [row] = await tx
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return Boolean(row);
}

async function* chunksOf(bytes: Uint8Array) {
    yield bytes;
}
