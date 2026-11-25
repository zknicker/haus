import type { DriveRemote } from './drive-remote.ts';
import type { DriveRevisionFacts } from './drive-response-schema.ts';
import type { FolderFiles } from './folder-files.ts';
import { placeJournaled } from './folder-placing.ts';
import {
    areaOfPath,
    type DriveFolderLayout,
    type FolderStateStore,
    isReadOnlyArea,
    unplacedMtimeMs,
} from './folder-state.ts';
import { type FileStamp, sameStamp } from './folder-walk.ts';

export interface OutcomeContext {
    files: FolderFiles;
    layout: DriveFolderLayout;
    remote: DriveRemote;
    state: FolderStateStore;
}

export async function catchUpSkippedHead(context: OutcomeContext, path: string) {
    const { files, state } = context;
    const head = await context.remote.head(path);
    const record = state.current().files[path];
    const local = await files.inspect(path, record);
    const unedited =
        local === null ||
        (record !== undefined && typeof local !== 'string' && local.sha256 === record.sha256);
    const lock = readOnlyRoot(context, path);
    if (head === null) {
        if (record && local !== null && unedited) {
            await files.remove(path, lock);
        }
        await state.forget(path);
        return;
    }
    if (record?.revision_id !== head.revision_id && unedited) {
        const incoming = await download(context, head);
        await converge(
            context,
            path,
            head,
            incoming,
            lock,
            typeof local === 'object' ? local : null
        );
    }
}

export async function restoreUnplaced(context: OutcomeContext, path: string) {
    const { files, state } = context;
    const head = await context.remote.head(path);
    if (head === null || (await files.occupant(head.path)) !== 'none') {
        await state.forget(path);
        return;
    }
    const incoming = await download(context, head);
    if (head.path !== path) {
        await state.forget(path);
    }
    await converge(context, head.path, head, incoming, readOnlyRoot(context, head.path), null);
}

export async function converge(
    context: OutcomeContext,
    path: string,
    current: DriveRevisionFacts,
    incoming: string | null,
    lock: string | null,
    expected: FileStamp | null
) {
    const { files, state } = context;
    if (incoming === null) {
        const stamp = await files.stamp(path);
        const unchanged = stamp !== null && (expected === null || sameStamp(stamp, expected));
        const mtimeMs = unchanged ? stamp.mtimeMs : (expected?.mtimeMs ?? unplacedMtimeMs);
        await state.record(recordOf(current, mtimeMs, path));
        return;
    }
    const { mtime_ms: _unplaced, ...placement } = recordOf(current, unplacedMtimeMs, path);
    if ((await placeJournaled(context, placement, incoming, lock, expected)) === null) {
        await state.markSeen(path, current.revision_id);
    }
}

export async function respellTo(
    context: OutcomeContext,
    path: string,
    target: string,
    lock: string | null
) {
    if (target === path) {
        return;
    }
    await context.state.rename((await context.files.respell(path, target, lock)) ?? []);
    await context.state.forget(path);
}

export async function download(context: OutcomeContext, revision: DriveRevisionFacts) {
    const scratch = await context.files.scratchFile();
    await context.remote.download(revision, scratch);
    return scratch;
}

export function recordOf(revision: DriveRevisionFacts, mtimeMs: number, path = revision.path) {
    return {
        artifact_id: revision.artifact_id,
        mtime_ms: mtimeMs,
        path,
        revision_id: revision.revision_id,
        sha256: revision.sha256,
        size_bytes: revision.size_bytes,
    };
}

export function readOnlyRoot(context: OutcomeContext, path: string) {
    const area = areaOfPath(context.state.current().areas, path);
    return area && isReadOnlyArea(area.area, context.layout.writer) ? area.root : null;
}
