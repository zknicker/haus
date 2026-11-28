import type { DriveRemote } from './drive-remote.ts';
import type { DriveChangeEntry } from './drive-response-schema.ts';
import type { FolderFiles } from './folder-files.ts';
import { type DriveFolderState, type FolderStateStore, foldedRecord } from './folder-state.ts';

export type PutChange = Extract<DriveChangeEntry, { change: 'put' }>;

export async function prefetchBodies(input: {
    changes: readonly DriveChangeEntry[];
    files: FolderFiles;
    remote: DriveRemote;
    state: FolderStateStore;
}) {
    const slots = downloadSlots(pullDownloadConcurrency);
    const download = async (change: PutChange) => {
        const release = await slots.acquire();
        try {
            const scratch = await input.files.scratchFile();
            await input.remote.download(change, scratch);
            return scratch;
        } finally {
            release();
        }
    };
    const bodies = new Map<DriveChangeEntry, Promise<string>>();
    const state = input.state.current();
    for (const change of input.changes) {
        if (change.change === 'put' && (await needsDownload(input.files, state, change))) {
            const body = download(change);
            body.catch(() => null);
            bodies.set(change, body);
        }
    }
    return {
        body: (change: PutChange) => bodies.get(change) ?? download(change),
        settled: () => Promise.allSettled(bodies.values()),
    };
}

async function needsDownload(files: FolderFiles, state: DriveFolderState, change: PutChange) {
    const record = state.files[change.path];
    if (record?.revision_id === change.revision_id || record?.sha256 === change.sha256) {
        return false;
    }
    const stamp = await files.stamp(change.path).catch(() => undefined);
    if (stamp === undefined) {
        return false;
    }
    if (!record) {
        return (
            stamp === null &&
            !(change.path in state.pendingCreates) &&
            foldedRecord(state, change.path) === null
        );
    }
    return stamp?.size === record.size_bytes && stamp.mtimeMs === record.mtime_ms;
}

const pullDownloadConcurrency = 8;

function downloadSlots(limit: number) {
    let free = limit;
    const waiting: (() => void)[] = [];
    const release = () => {
        const next = waiting.shift();
        if (next) {
            next();
            return;
        }
        free += 1;
    };
    return {
        acquire: async () => {
            if (free > 0) {
                free -= 1;
                return release;
            }
            await new Promise<void>((resolve) => waiting.push(resolve));
            return release;
        },
    };
}
