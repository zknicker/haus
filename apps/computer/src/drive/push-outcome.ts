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
    const { files, state } = context;
    const { current, path } = outcome;
    const lock = readOnlyRoot(context, path);
    const asideTarget = asideTargetOf(context, outcome, ownSha256);
    const atPath = asideTarget ? null : ownSha256;
    const incoming = current && atPath !== current.sha256 ? await download(context, current) : null;
    const aside =
        asideTarget && ownSha256 ? await files.setAside(path, asideTarget, ownSha256, lock) : null;
    if (current === null) {
        await files.remove(path, lock);
        await state.forget(path);
    } else {
        const mtimeMs = incoming
            ? await files.place(path, incoming, lock)
            : (await lstat(files.absolute(path))).mtimeMs;
        await state.record(recordOf(current, mtimeMs, path));
    }
    if (aside) {
        const mtimeMs = await files.release(aside);
        if (outcome.outcome === 'kept_both' && aside === asideTarget) {
            await state.record(recordOf(outcome.copy, mtimeMs));
        }
    }
}

function asideTargetOf(
    context: OutcomeContext,
    outcome: DrivePushOutcomeEntry,
    ownSha256: string | null
) {
    if (ownSha256 === null) {
        return null;
    }
    if (outcome.outcome === 'kept_both') {
        return context.files.absolute(outcome.copy.path);
    }
    return outcome.outcome === 'refused'
        ? join(context.layout.refused, ...outcome.path.split('/'))
        : null;
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
