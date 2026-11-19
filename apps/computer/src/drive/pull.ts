import type { DriveAreaCounters } from '@haus/api';
import type { DriveRemote } from './drive-remote.ts';
import type { DriveChangeEntry } from './drive-response-schema.ts';
import { type FolderFiles, folderFiles } from './folder-files.ts';
import {
    type DriveFolderArea,
    type DriveFolderLayout,
    type FolderStateStore,
    isReadOnlyArea,
    openFolderState,
} from './folder-state.ts';

type ChangeResult = 'applied' | 'blocked' | 'kept' | 'skipped';

export async function pullDrive(input: { layout: DriveFolderLayout; remote: DriveRemote }) {
    const state = await openFolderState(input.layout);
    const files = folderFiles(input.layout);
    const tally: Record<ChangeResult, number> = { applied: 0, blocked: 0, kept: 0, skipped: 0 };
    let since: DriveAreaCounters = { ...state.current().counters };
    let until: DriveAreaCounters | undefined;
    let areas: DriveFolderArea[] = state.current().areas;
    await files.clearScratch();
    try {
        for (;;) {
            const page = await input.remote.changes(since, until);
            until ??= page.until;
            areas = page.areas.map(({ area, root }) => ({ area, root }));
            for (const change of page.changes) {
                const readOnlyRoot = readOnlyRootOf(areas, change.area, input.layout.writer);
                tally[await applyChange({ ...input, files, readOnlyRoot, state }, change)] += 1;
                since = { ...since, [change.area]: change.sequence };
            }
            if (page.complete) {
                break;
            }
        }
        if (tally.blocked === 0) {
            await state.advance(areas, until);
        }
    } finally {
        await files.relock();
    }
    return { ...tally, advanced: tally.blocked === 0 };
}

interface ChangeContext {
    files: FolderFiles;
    readOnlyRoot: string | null;
    remote: DriveRemote;
    state: FolderStateStore;
}

async function applyChange(context: ChangeContext, change: DriveChangeEntry) {
    const { files, state } = context;
    const record = state.current().files[change.path];
    if (change.change === 'put' && record?.revision_id === change.revision_id) {
        return 'skipped';
    }
    const local = await files.inspect(change.path, record);
    if (local === 'blocked') {
        return 'blocked';
    }
    if (change.change === 'delete') {
        if (!record) {
            return 'skipped';
        }
        if (local && local.sha256 !== record.sha256) {
            return 'kept';
        }
        return await blockedOnLocalPath(async () => {
            await files.remove(change.path, context.readOnlyRoot);
            await state.forget(change.path);
            return 'applied';
        });
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
        return 'applied';
    }
    const unedited = record ? local?.sha256 === record.sha256 : local === null;
    if (!unedited) {
        return 'kept';
    }
    const scratch = await files.scratchFile();
    await context.remote.download(change, scratch);
    return await blockedOnLocalPath(async () => {
        const mtimeMs = await files.place(change.path, scratch, context.readOnlyRoot);
        await state.record({ ...facts, mtime_ms: mtimeMs });
        return 'applied';
    });
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

function readOnlyRootOf(areas: readonly DriveFolderArea[], area: string, writer: string) {
    return isReadOnlyArea(area, writer)
        ? (areas.find((candidate) => candidate.area === area)?.root ?? null)
        : null;
}
