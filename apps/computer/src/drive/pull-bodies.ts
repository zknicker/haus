import type { DriveRemote } from './drive-remote.ts';
import type { DriveChangeEntry } from './drive-response-schema.ts';
import type { FolderFiles } from './folder-files.ts';
import { SymlinkedFolderError } from './folder-spelling.ts';
import { type DriveFolderState, type FolderStateStore, foldedRecord } from './folder-state.ts';

export type PutChange = Extract<DriveChangeEntry, { change: 'put' }>;

export async function prefetchBodies(input: {
    changes: readonly DriveChangeEntry[];
    files: FolderFiles;
    remote: DriveRemote;
    state: FolderStateStore;
}) {
    const download = async (change: PutChange) => {
        const scratch = await input.files.scratchFile();
        await input.remote.download(change, scratch);
        return scratch;
    };
    const state = input.state.current();
    const ahead: PutChange[] = [];
    for (const change of input.changes) {
        if (change.change === 'put' && (await needsDownload(input.files, state, change))) {
            ahead.push(change);
        }
    }
    const queued: Promise<string>[] = [];
    const bodies = new Map<DriveChangeEntry, Promise<string>>();
    for (const change of ahead) {
        const before = queued.at(-pullDownloadConcurrency);
        const body = Promise.allSettled(before ? [before] : []).then(() => download(change));
        queued.push(body);
        bodies.set(change, body);
    }
    const settled = Promise.allSettled(queued);
    return {
        body: (change: PutChange) => bodies.get(change) ?? download(change),
        settled: () => settled,
    };
}

async function needsDownload(files: FolderFiles, state: DriveFolderState, change: PutChange) {
    const record = state.files[change.path];
    if (record?.revision_id === change.revision_id || record?.sha256 === change.sha256) {
        return false;
    }
    const stamp = await stampOf(files, change.path);
    if (stamp === 'symlinked') {
        return false;
    }
    if (!record) {
        return (
            stamp === null &&
            !(change.path in state.pendingCreates) &&
            foldedRecord(state, change.path) === null
        );
    }
    return stamp !== null && stamp.size === record.size_bytes && stamp.mtimeMs === record.mtime_ms;
}

async function stampOf(files: FolderFiles, path: string) {
    try {
        return await files.stamp(path);
    } catch (error) {
        if (error instanceof SymlinkedFolderError) {
            return 'symlinked' as const;
        }
        throw error;
    }
}

const pullDownloadConcurrency = 8;
