import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveRemote } from './drive-remote.ts';
import type { DrivePushOutcomeEntry, DriveRevisionFacts } from './drive-response-schema.ts';
import type { FolderFiles } from './folder-files.ts';
import {
    areaOfPath,
    type DriveFolderLayout,
    type FolderStateStore,
    isReadOnlyArea,
} from './folder-state.ts';

export interface OutcomeContext {
    files: FolderFiles;
    layout: DriveFolderLayout;
    remote: DriveRemote;
    state: FolderStateStore;
}

export async function applyPushOutcome(
    context: OutcomeContext,
    outcome: DrivePushOutcomeEntry,
    ownSha256: string | null
) {
    const { files, layout, state } = context;
    const movesAside =
        ownSha256 !== null && (outcome.outcome === 'kept_both' || outcome.outcome === 'refused');
    const atPath = movesAside ? null : ownSha256;
    const { current, path } = outcome;
    const incoming = current && atPath !== current.sha256 ? await download(context, current) : null;
    if (outcome.outcome === 'kept_both' && movesAside) {
        const mtimeMs = await files.move(
            path,
            files.absolute(outcome.copy.path),
            readOnlyRoot(context, path)
        );
        await state.record(recordOf(outcome.copy, mtimeMs));
    }
    if (outcome.outcome === 'refused' && movesAside) {
        await files.move(
            path,
            join(layout.refused, ...path.split('/')),
            readOnlyRoot(context, path)
        );
    }
    if (current === null) {
        await files.remove(path, readOnlyRoot(context, path));
        await state.forget(path);
        return;
    }
    const mtimeMs = incoming
        ? await files.place(path, incoming, readOnlyRoot(context, path))
        : (await lstat(files.absolute(path))).mtimeMs;
    await state.record(recordOf(current, mtimeMs, path));
}

async function download(context: OutcomeContext, revision: DriveRevisionFacts) {
    const scratch = await context.files.scratchFile();
    await context.remote.download(revision, scratch);
    return scratch;
}

function recordOf(revision: DriveRevisionFacts, mtimeMs: number, path = revision.path) {
    return {
        artifact_id: revision.artifact_id,
        mtime_ms: mtimeMs,
        path,
        revision_id: revision.revision_id,
        sha256: revision.sha256,
        size_bytes: revision.size_bytes,
    };
}

function readOnlyRoot(context: OutcomeContext, path: string) {
    const area = areaOfPath(context.state.current().areas, path);
    return area && isReadOnlyArea(area.area, context.layout.writer) ? area.root : null;
}
