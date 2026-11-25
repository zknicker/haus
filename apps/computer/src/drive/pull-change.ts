import type { DriveRemote } from './drive-remote.ts';
import type { DriveChangeEntry } from './drive-response-schema.ts';
import type { FolderFiles } from './folder-files.ts';
import { placeJournaled } from './folder-placing.ts';
import {
    type DriveFileRecord,
    type FolderStateStore,
    foldedRecord,
    unplacedMtimeMs,
} from './folder-state.ts';

export type ChangeResult = 'applied' | 'blocked' | 'kept' | 'skipped';

export interface ChangeContext {
    files: FolderFiles;
    readOnlyRoot: string | null;
    remote: DriveRemote;
    state: FolderStateStore;
}

type PutChange = Extract<DriveChangeEntry, { change: 'put' }>;
type DeleteChange = Extract<DriveChangeEntry, { change: 'delete' }>;

export async function applyChange(context: ChangeContext, change: DriveChangeEntry) {
    return change.change === 'delete'
        ? await applyDelete(context, change)
        : await applyPut(context, change);
}

async function applyDelete(context: ChangeContext, change: DeleteChange) {
    const { files, state } = context;
    const record = state.current().files[change.path];
    if (!record) {
        return 'skipped' satisfies ChangeResult;
    }
    const local = await files.inspect(change.path, record);
    if (
        local === 'variant' ||
        (local !== null && local !== 'blocked' && local.sha256 !== record.sha256)
    ) {
        await state.markSeen(change.path, 'deleted');
        return 'kept' satisfies ChangeResult;
    }
    return await blockedOnLocalPath(async () => {
        await files.remove(change.path, context.readOnlyRoot);
        await state.forget(change.path);
        return 'applied';
    });
}

async function applyPut(context: ChangeContext, change: PutChange) {
    const { files, state } = context;
    const record = state.current().files[change.path] ?? (await respelledRecord(context, change));
    if (record?.revision_id === change.revision_id) {
        return 'skipped' satisfies ChangeResult;
    }
    let local = await files.inspect(change.path, record);
    if (local === 'variant') {
        if (record || !(await dropDisplaced(context, change.path))) {
            await state.markSeen(change.path, change.revision_id);
            return 'kept' satisfies ChangeResult;
        }
        local = null;
    }
    if (local === 'blocked') {
        return 'blocked' satisfies ChangeResult;
    }
    const facts = {
        artifact_id: change.artifact_id,
        path: change.path,
        revision_id: change.revision_id,
        sha256: change.sha256,
        size_bytes: change.size_bytes,
    };
    if (local?.sha256 === change.sha256) {
        await state.record({ ...facts, mtime_ms: local.mtimeMs });
        return 'applied' satisfies ChangeResult;
    }
    if (!record && (await adoptPendingCreate(state, facts, local !== null))) {
        return 'kept' satisfies ChangeResult;
    }
    const unedited = record ? local?.sha256 === record.sha256 : local === null;
    if (!unedited) {
        await state.markSeen(change.path, change.revision_id);
        return 'kept' satisfies ChangeResult;
    }
    const scratch = await files.scratchFile();
    await context.remote.download(change, scratch);
    return await blockedOnLocalPath(async () => {
        if ((await placeJournaled(context, facts, scratch, context.readOnlyRoot, local)) === null) {
            await state.markSeen(change.path, change.revision_id);
            return 'kept';
        }
        return 'applied';
    });
}

async function respelledRecord(context: ChangeContext, change: PutChange) {
    const folded = foldedRecord(context.state.current(), change.path);
    if (folded?.artifact_id !== change.artifact_id) {
        return undefined;
    }
    const moves = await context.files.respell(folded.path, change.path, context.readOnlyRoot);
    if (moves === null) {
        return undefined;
    }
    await context.state.rename(moves);
    return context.state.current().files[change.path];
}

async function dropDisplaced(context: ChangeContext, path: string) {
    const { files, state } = context;
    const folded = foldedRecord(state.current(), path);
    if (!folded) {
        return false;
    }
    const local = await files.inspect(folded.path, folded);
    if (local !== null && (typeof local === 'string' || local.sha256 !== folded.sha256)) {
        await state.markSeen(folded.path, 'deleted');
        return false;
    }
    await files.remove(folded.path, context.readOnlyRoot);
    await state.forget(folded.path);
    return true;
}

async function adoptPendingCreate(
    state: FolderStateStore,
    facts: Omit<DriveFileRecord, 'mtime_ms'>,
    isLocal: boolean
) {
    if (state.current().pendingCreates[facts.path]?.sha256 !== facts.sha256) {
        return false;
    }
    if (!isLocal) {
        await state.dropPendingCreate(facts.path);
        return false;
    }
    await state.record({ ...facts, mtime_ms: unplacedMtimeMs });
    return true;
}

const localPathErrors = new Set(['EEXIST', 'EISDIR', 'ENOTDIR', 'ENOTEMPTY']);

async function blockedOnLocalPath(apply: () => Promise<ChangeResult>) {
    return await apply().catch((error: NodeJS.ErrnoException) => {
        if (localPathErrors.has(error.code ?? '')) {
            return 'blocked' as const;
        }
        throw error;
    });
}
