import { type AgentDriveWriteInput, artifactPublishInputSchema } from '@haus/api';
import type { ArtifactActor } from '../artifacts/access.ts';
import { publishArtifact } from '../artifacts/publish.ts';
import { ArtifactError, type ArtifactStorage } from '../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../artifacts/thumbnails.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { readTaskDriveFolders, requireTaskDriveFolder } from './task-folders.ts';

export interface TaskDriveWriteOptions {
    appOrigin: string;
    budget: number;
    db: HausDatabase;
    storage: ArtifactStorage | null;
    thumbnails: ArtifactThumbnails | null;
}

/**
 * `haus drive write` (specs/tasks.md#drive): a Task writes one file under its own folders as a
 * new revision attributed to the Task, replacing the current one. Captains edit their `drive/`
 * folder instead.
 */
export async function writeTaskDriveFile(
    options: TaskDriveWriteOptions,
    runner: ResolvedRunner,
    input: AgentDriveWriteInput
) {
    const actor: ArtifactActor = { kind: 'agent', runner };
    const task = await readTaskDriveFolders(options.db, runner);
    if (!task) {
        throw new ArtifactError(
            'Captains edit Drive in their `drive/` folder, which syncs after the turn. `haus drive write` is for Tasks.',
            409,
            'DRIVE_WRITE_USE_FOLDER'
        );
    }
    const publish = artifactPublishInputSchema.parse({
        ...(input.contentType ? { content_type: input.contentType } : {}),
        path: input.path,
        replace: true,
        request_id: input.requestId,
    });
    requireTaskDriveFolder(task.folders, publish.path);
    const result = await publishArtifact({
        actor,
        budget: options.budget,
        db: options.db,
        input: publish,
        origin: options.appOrigin,
        storage: options.storage,
        stream: bytes(Buffer.from(input.contentBase64, 'base64')),
        taskId: task.taskId,
        thumbnails: options.thumbnails,
    });
    return { artifact: result.artifact, citation: driveCitation(result.artifact.path) };
}

function driveCitation(path: string) {
    const name = path.slice(path.lastIndexOf('/') + 1).replaceAll(/[[\]]/gu, '');
    return /\s/u.test(path) ? `[${name}](<drive://${path}>)` : `[${name}](drive://${path})`;
}

async function* bytes(content: Uint8Array) {
    yield content;
}
