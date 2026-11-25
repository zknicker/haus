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
    const target = current?.path ?? path;
    if (ownSha256 === null && (await files.occupant(target)) === 'variant') {
        await state.forget(path);
        return;
    }
    const lock = readOnlyRoot(context, target);
    const asideTarget = asideTargetOf(context, outcome, ownSha256);
    const atPath = asideTarget ? null : ownSha256;
    const incoming = current && atPath !== current.sha256 ? await download(context, current) : null;
    const aside =
        asideTarget && ownSha256
            ? await files.setAside(path, asideTarget, ownSha256, readOnlyRoot(context, path))
            : null;
    if (current === null) {
        await files.remove(path, lock);
        await state.forget(path);
    } else {
        if (target !== path) {
            await files.respell(path, target, lock);
            await state.forget(path);
        }
        await converge(context, target, current, incoming, lock);
    }
    if (aside) {
        const mtimeMs = await files.release(aside);
        if (outcome.outcome === 'kept_both' && aside === asideTarget) {
            await state.record(recordOf(outcome.copy, mtimeMs));
        }
    }
}

export async function catchUpSkippedHead(context: OutcomeContext, path: string) {
    const { files, state } = context;
    const head = await context.remote.head(path);
    const record = state.current().files[path];
    const occupant = await files.occupant(path);
    const lock = readOnlyRoot(context, path);
    if (head === null) {
        if (record && occupant === 'exact') {
            await files.remove(path, lock);
        }
        await state.forget(path);
        return;
    }
    const replaceable = occupant === 'none' || (record !== undefined && occupant === 'exact');
    if (record?.revision_id !== head.revision_id && replaceable) {
        await converge(context, path, head, await download(context, head), lock);
    }
}

export async function restoreUnplaced(context: OutcomeContext, path: string) {
    const { files, state } = context;
    const head = await context.remote.head(path);
    if (head === null || (await files.occupant(path)) !== 'none') {
        await state.forget(path);
        return;
    }
    await converge(context, path, head, await download(context, head), readOnlyRoot(context, path));
}

async function converge(
    context: OutcomeContext,
    path: string,
    current: DriveRevisionFacts,
    incoming: string | null,
    lock: string | null
) {
    const { files, state } = context;
    const mtimeMs = incoming
        ? await files.place(path, incoming, lock)
        : (await lstat(files.absolute(path))).mtimeMs;
    await state.record(recordOf(current, mtimeMs, path));
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
